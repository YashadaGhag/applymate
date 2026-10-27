import { getState, updateState, getJobsStore, getResumesStore, getSchedulerStore, updateSchedulerStore } from "../store/store.js";
import { acquireRunLock, peekRunLock } from "../store/runLock.js";
import { isOnboardingComplete } from "../routes/state.js";
import { runScrape } from "../scraper/fetchJobs.js";
import { scoreJobs, selectEligibleJobs } from "../ai/runScoring.js";
import { matchBand } from "../ai/matchBand.js";
import { decideRun, MAX_ATTEMPTS_PER_SLOT } from "./dueTime.js";
import { detectCompany, storeDetection } from "../scraper/detect.js";
import { companiesNeedingWork, hasNoDomain, startAttempt, clearAttempts } from "./newCompanies.js";
import { setWatchlistSavedHandler, setOthersStartHandler, setCompanyRetryHandler } from "./trigger.js";
import { othersMayRun, scrapeIsFresh } from "./othersWork.js";

// The daily scheduler: inside the API process, checks on start and every 15 minutes whether a run
// is due (see dueTime.js) and, if so, runs the same pipeline as `npm run fetch:jobs` (the scrape,
// then a scoring run) in the background. It takes the shared data/run.lock, so it never overlaps a
// manual fetch:jobs, score:jobs or a Replace resume run: a held lock means "skip, try next tick".
// Set APPLYMATE_SCHEDULER=off to turn it off. Tests never start it (see startScheduler).

const TICK_MS = 15 * 60 * 1000;
const FIRST_TICK_DELAY_MS = 1000;

const defaultDeps = {
  now: () => Date.now(),
  log: (line) => console.log(`[scheduler] ${line}`),
  warn: (line) => console.warn(`[scheduler] ${line}`),
  getState,
  getResumesStore,
  getSchedulerStore,
  updateSchedulerStore,
  acquireRunLock,
  peekRunLock,
  runScrape,
  scoreJobs,
  updateState,
  getJobsStore,
  detectCompany,
  storeDetection,
  // The Others jobs that pass the prefilter for the current resume and profile (read live, after the scrape).
  othersJobIds: () => selectEligibleJobs(getState(), getJobsStore().jobs).filter((e) => e.tab === "others").map((e) => e.job.id),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// Pause between two companies' detection probes (the same pace as detect:ats).
const DETECT_DELAY_MS = 1500;

// In memory only: set while THIS process holds the lock for a scheduled run, so "running" in the
// status route is never a leftover from a dead process.
let current = null; // { phase, startedAt }
let busy = false;
let lastLogged = null;

const iso = (ms) => new Date(ms).toISOString();

// Why there is nothing to run, or null. Nothing is scraped before the person has finished setup.
// An empty watchlist is fine: Others still gets scraped and scored (see the Others start below).
export function skipReason(deps = defaultDeps) {
  const state = deps.getState();
  if (!isOnboardingComplete(state)) return "onboarding is not complete";
  const { currentVersion, versions } = deps.getResumesStore();
  if (!currentVersion || !versions?.[currentVersion]?.text) return "no active resume";
  return null;
}

// One line per change of decision, not one per 15-minute tick.
function logDecision(deps, key, line) {
  if (lastLogged === key) return;
  lastLogged = key;
  deps.log(line);
}

/**
 * One scheduler check. Never throws, never blocks the caller beyond its own awaits (the API
 * doesn't await it). Returns { ran, outcome?, skipped? } for tests.
 */
async function runDailyCheck(deps) {
  try {
    const nowMs = deps.now();

    const reason = skipReason(deps);
    if (reason) {
      logDecision(deps, `skip:${reason}`, `skipped: ${reason}.`);
      return { ran: false, skipped: reason };
    }

    const store = deps.getSchedulerStore();
    const decision = decideRun({ nowMs, lastScrapeAt: deps.getState().meta?.lastScrapeAt ?? null, slot: store.slot });
    if (decision.action === "wait") {
      const text = {
        "up-to-date": "not due: today's scrape and scoring are already done.",
        "daily-cap": `not due: ${MAX_ATTEMPTS_PER_SLOT} attempts failed since the last 9:00 AM Pacific, trying again after the next one.`,
        backoff: `not due: waiting to retry after an earlier failure, next attempt after ${decision.nextAttemptAt}.`,
      }[decision.reason];
      logDecision(deps, `wait:${decision.reason}:${decision.slotStart}`, text);
      return { ran: false, skipped: decision.reason };
    }

    const lock = deps.acquireRunLock(decision.needsScrape ? "scrape" : "score");
    if (!lock.ok) {
      logDecision(deps, `locked:${lock.holder?.kind}`, `due (${decision.reason}) but skipped: a ${lock.holder?.kind ?? "scrape or scoring"} run holds the lock (pid ${lock.holder?.pid}); will check again in 15 minutes.`);
      return { ran: false, skipped: "locked" };
    }
    lastLogged = null;
    try {
      return await runLocked(deps, decision, store, nowMs);
    } finally {
      lock.release();
    }
  } catch (err) {
    // Anything unexpected before a run started (a corrupt file, say): log, try again next tick.
    deps.warn(`check failed: ${err.message}`);
    return { ran: false, skipped: "error" };
  } finally {
    current = null;
  }
}

/**
 * One scheduler check: the daily rule, then any waiting new-company work (a company saved while
 * the lock was busy, or a failure whose backoff has passed). Never throws. Returns the daily
 * check's { ran, outcome?, skipped? } (the company work's result is under companies).
 */
export async function runTick(overrides = {}) {
  const deps = { ...defaultDeps, ...overrides };
  if (busy) return { ran: false, skipped: "busy" };
  busy = true;
  let daily;
  let companies;
  let others;
  try {
    daily = await runDailyCheck(deps);
    companies = companyWorkEnabled(deps) ? await runCompanyWork(deps) : null;
    others = othersWorkEnabled(deps) ? await runOthersWork(deps) : null;
  } finally {
    current = null;
    busy = false;
  }
  if (daily?.ran || companies?.ran || others?.ran) await chainedCheck(deps, companies?.attemptedIds);
  const extra = { ...(companies ? { companies } : {}), ...(others ? { others } : {}) };
  return Object.keys(extra).length ? { ...daily, ...extra } : daily;
}

/**
 * Right after any background run ends (the daily run, new-company work, the Others start), look
 * once for waiting work that arrived meanwhile (a watchlist saved or a Continue clicked during the
 * run) instead of leaving it for the next 15-minute tick. It cannot loop: it runs only after a
 * run that actually ran, it never chains itself, and each stage it starts counts an attempt before
 * it begins, so the failure backoff (30 minutes, 2 hours, then the next 9 AM) gates it exactly as
 * it gates a tick. A held lock leaves the work waiting and counts nothing. Companies the run that
 * just ended already worked on (`justTried`) are left for a later tick: a scrape that failed right
 * after a successful detection has no backoff yet, and must not be retried the same second.
 */
async function chainedCheck(deps, justTried = []) {
  if (busy) return null;
  busy = true;
  try {
    const companies = companyWorkEnabled(deps) ? await runCompanyWork(deps, justTried) : null;
    const others = othersWorkEnabled(deps) ? await runOthersWork(deps) : null;
    return { companies, others };
  } finally {
    current = null;
    busy = false;
  }
}

// Company work needs the real detection and scraping, so tests must opt in with fakes
// (companyWork: true); under node --test it is otherwise off and no tick can touch the network.
const companyWorkEnabled = (deps) => deps.companyWork ?? !process.env.NODE_TEST_CONTEXT;
// Same for the Others start (othersWork: true opts a test in with fakes).
const othersWorkEnabled = (deps) => deps.othersWork ?? !process.env.NODE_TEST_CONTEXT;

// New watchlist companies: detect each new company's source, scrape only those companies and
// score their jobs, in the background, after a watchlist save (and on any later tick for anything
// that was left waiting). The full Others scrape never runs here; lastScrapeAt is not touched.

// Why scoring can't run (detection and scraping still do), or null.
function cannotScoreReason(deps) {
  if (!isOnboardingComplete(deps.getState())) return "onboarding is not complete";
  const { currentVersion, versions } = deps.getResumesStore();
  if (!currentVersion || !versions?.[currentVersion]?.text) return "no active resume";
  return null;
}

async function runCompanyWork(deps, exclude = [], { rescore = false } = {}) {
  try {
    const nowMs = deps.now();
    const state = deps.getState();
    const needing = companiesNeedingWork(state.watchlist, state.companyMeta, nowMs);
    const detect = needing.detect.filter((c) => !exclude.includes(c.id));
    const scrape = needing.scrape.filter((c) => !exclude.includes(c.id));
    // Try again after a scoring failure has nothing to detect or scrape: it scores the watchlist
    // companies' jobs that still have no score (the cache means only those cost a call).
    const extraScoreIds = rescore && detect.length + scrape.length === 0
      ? (state.watchlist ?? []).filter((c) => state.companyMeta?.[c.id]?.scrapeStatus === "ok").map((c) => c.id)
      : [];
    if (detect.length + scrape.length === 0 && extraScoreIds.length === 0) return { ran: false, skipped: "nothing" };

    const lock = deps.acquireRunLock("scrape");
    if (!lock.ok) {
      // Nothing is lost: "waiting" is derived from companyMeta, so the next tick finds them again.
      logDecision(
        deps,
        `companies-locked:${lock.holder?.kind}`,
        `${detect.length + scrape.length} new or waiting company(ies), but a ${lock.holder?.kind ?? "scrape or scoring"} run holds the lock (pid ${lock.holder?.pid}); leaving them waiting for the next check.`
      );
      return { ran: false, skipped: "locked", waiting: detect.length + scrape.length };
    }
    lastLogged = null;
    try {
      return await runCompanyWorkLocked(deps, { detect, scrape, extraScoreIds }, nowMs);
    } finally {
      lock.release();
    }
  } catch (err) {
    deps.warn(`new-company check failed: ${err.message}`);
    return { ran: false, skipped: "error" };
  }
}

async function runCompanyWorkLocked(deps, { detect, scrape, extraScoreIds = [] }, nowMs) {
  const startedAt = iso(nowMs);
  const patchMeta = (id, patch) =>
    deps.updateState((s) => ({ ...s, companyMeta: { ...s.companyMeta, [id]: { ...(s.companyMeta?.[id] ?? {}), ...patch } } }));

  // An attempt is counted when it starts, so a crash mid-run can't loop (see newCompanies.js).
  for (const company of [...detect, ...scrape]) {
    patchMeta(company.id, startAttempt(deps.getState().companyMeta?.[company.id], nowMs));
  }
  deps.updateSchedulerStore((s) => ({
    ...s,
    lastRun: { startedAt, finishedAt: null, outcome: null, failedPhase: null, scored: 0, calls: 0, newJobs: 0, message: null, kind: "new-companies" },
  }));
  deps.log(`started (new companies): detect ${detect.length}, scrape ${detect.length + scrape.length}, no Others scrape.`);

  const summary = { scored: 0, calls: 0, newJobs: 0, message: null };
  let failedPhase = null;
  const noSource = [];
  const errors = [];
  let okCount = 0;

  try {
    current = { phase: "scraping", startedAt };
    const toScrape = scrape.map((c) => c.id);

    for (const [i, company] of detect.entries()) {
      if (i > 0) await deps.sleep(DETECT_DELAY_MS);
      let detection;
      if (hasNoDomain(company)) {
        detection = { atsPlatform: null, atsSlug: null, scrapeStatus: "no_source", atsHint: null };
      } else {
        try {
          detection = await deps.detectCompany(company, deps.getState().companyMeta?.[company.id] ?? {});
        } catch (err) {
          detection = { atsPlatform: null, atsSlug: null, scrapeStatus: "error", atsHint: null };
          deps.warn(`detection failed for ${company.name}: ${err.message}`);
        }
      }
      deps.storeDetection(company.id, detection);
      if (detection.scrapeStatus === "ok") {
        patchMeta(company.id, { scrapePending: true, workFailedAt: null, ...clearAttempts });
        toScrape.push(company.id);
      } else if (detection.scrapeStatus === "no_source") {
        // A company with no source shows nothing (no tag, no toast); this records it for a later notice.
        patchMeta(company.id, { noSourceAt: iso(deps.now()), ...clearAttempts });
        noSource.push(company.id);
        deps.log(`${company.name}: no automatic source found.`);
      } else {
        errors.push(company.id);
        deps.warn(`${company.name}: could not tell which source it uses; will retry later.`);
      }
    }

    const scrapedOk = [];
    if (toScrape.length > 0) {
      const result = await deps.runScrape({ companyIds: toScrape });
      for (const id of result.okCompanyIds ?? []) {
        patchMeta(id, { scrapePending: false, workFailedAt: null, ...clearAttempts });
        scrapedOk.push(id);
      }
      errors.push(...(result.errorCompanyIds ?? []));
    }
    okCount = scrapedOk.length + noSource.length;
    deps.log(`detection and scrape finished: ${scrapedOk.length} scraped, ${noSource.length} without a source, ${errors.length} failed.`);

    if (errors.length > 0 && okCount === 0) {
      failedPhase = "scraping";
      summary.message = `Could not check ${errors.length} new company(ies); will retry later.`;
    } else if (scrapedOk.length > 0 || extraScoreIds.length > 0) {
      const blocked = cannotScoreReason(deps);
      if (blocked) {
        deps.log(`scoring skipped: ${blocked}.`);
      } else {
        current = { phase: "scoring", startedAt };
        const ids = new Set([...scrapedOk, ...extraScoreIds]);
        const onlyIds = deps.getJobsStore().jobs.filter((j) => ids.has(j.company?.id)).map((j) => j.id);
        const report = await deps.scoreJobs({ onlyIds, abortOnApiError: true, onCall: () => (summary.calls += 1) });
        summary.scored = report.scored?.length ?? 0;
        summary.newJobs = (report.scored ?? []).filter((x) => matchBand(x.score) !== null).length;
        if (report.status !== "ok") {
          failedPhase = "scoring";
          summary.message = report.reason ?? "Scoring did not run.";
        } else if (report.aborted) {
          failedPhase = "scoring";
          summary.message = `Scoring stopped on an API error: ${report.aborted}`;
        }
      }
    }
  } catch (err) {
    failedPhase = failedPhase ?? (current?.phase === "scoring" ? "scoring" : "scraping");
    summary.message = err.message;
  }

  // A company this run worked on that is still waiting for its first scrape failed (an error, or
  // the run stopped): say so, so the onboarding loader can name it. Success clears the mark.
  for (const company of [...detect, ...scrape]) {
    const meta = deps.getState().companyMeta?.[company.id];
    if (meta?.scrapeStatus === "ok" && meta.scrapePending) patchMeta(company.id, { workFailedAt: iso(deps.now()) });
  }

  const finishedAt = iso(deps.now());
  const outcome = failedPhase ? "failed" : "done";
  deps.updateSchedulerStore((s) => ({
    ...s,
    lastRun: { startedAt, finishedAt, outcome, failedPhase, ...summary, kind: "new-companies" },
  }));
  current = null;
  if (failedPhase) {
    deps.warn(`new companies failed while ${failedPhase}: ${summary.message} (${summary.calls} call(s) made).`);
  } else {
    deps.log(`new companies finished: ${summary.scored} job(s) scored, ${summary.newJobs} newly visible, ${summary.calls} call(s).`);
  }
  return { ran: true, outcome, failedPhase, noSource, okCount, attemptedIds: [...detect, ...scrape].map((c) => c.id), ...summary };
}

/**
 * The watchlist-save trigger (registered by startScheduler, so it exists only when the scheduler is
 * enabled): works on new companies now, in the background. If a check or another run is already
 * going, it returns at once and the companies wait for the next tick.
 */
export async function triggerCompanyWork(overrides = {}, options = {}) {
  const deps = { ...defaultDeps, ...overrides };
  if (busy) {
    deps.log("watchlist saved while a scheduler check is running; new companies wait for the next check.");
    return { ran: false, skipped: "busy" };
  }
  busy = true;
  let result;
  try {
    result = await runCompanyWork(deps, [], options);
  } finally {
    current = null;
    busy = false;
  }
  if (result?.ran) await chainedCheck(deps, result.attemptedIds);
  return result;
}

/**
 * Try again on the onboarding loader (POST /api/watchlist/retry, via trigger.js): clears the waiting
 * backoff of the companies that failed (a detection error, or a scrape that failed) and runs the
 * same background work as a watchlist save, now. Returns { accepted, running? } at once (with a
 * non-enumerable `settled` promise for tests). A run already going, in this process or holding the
 * run lock elsewhere, means { running: true } and nothing is started or cleared, so repeated clicks
 * cost nothing. Nothing new inside the run: the same detection, scrape and scoring with the 150-call
 * ceiling and cache, no automatic retries.
 */
export function requestCompanyRetry(overrides = {}) {
  const deps = { ...defaultDeps, ...overrides };
  if (busy || current || deps.peekRunLock()) return { accepted: true, running: true };
  deps.updateState((s) => {
    const companyMeta = { ...s.companyMeta };
    for (const company of s.watchlist ?? []) {
      const meta = companyMeta[company.id];
      const failed = meta?.scrapeStatus === "error" || (meta?.scrapeStatus === "ok" && meta.scrapePending);
      if (failed) companyMeta[company.id] = { ...meta, workAttempts: 0, workLastAttemptAt: null };
    }
    return { ...s, companyMeta };
  });
  const last = deps.getSchedulerStore().lastRun;
  const rescore = last?.kind === "new-companies" && last.failedPhase === "scoring";
  const answer = { accepted: true, running: false };
  Object.defineProperty(answer, "settled", { value: triggerCompanyWork(overrides, { rescore }).catch(() => {}), enumerable: false });
  return answer;
}

// The Others start: the Role page's Continue. Scrape the Others boards when they have not been
// scraped since the most recent 9:00 AM Pacific, then score the Others jobs that pass the prefilter
// (the same runScrape and scoreJobs as everything else; no second pipeline). It works with an empty
// watchlist, so a brand-new person finds Others ready while building the watchlist.
//
// lastScrapeAt: the scrape here is the ordinary full scrape (every registered source plus Others), not
// a partial one, so it writes lastScrapeAt exactly as the daily run does. With an empty watchlist
// that scrape is Others, which is all that exists, so "Updated ... ago" is true. There is no
// Others-only scrape: it could not honestly write the marker while watchlist sources were stale.
// The daily slot record is not touched; after this scrape the daily run is scoring-only (cached).

async function runOthersWork(deps) {
  try {
    const nowMs = deps.now();
    const record = deps.getSchedulerStore().othersWork;
    const may = othersMayRun(record, nowMs);
    if (!may.ok) {
      if (may.reason !== "nothing") {
        const text =
          may.reason === "daily-cap"
            ? "Others start waiting: 3 attempts failed since the last 9:00 AM Pacific, trying again after the next one."
            : `Others start waiting to retry after an earlier failure, next attempt after ${may.nextAttemptAt}.`;
        logDecision(deps, `others-${may.reason}`, text);
      }
      return { ran: false, skipped: may.reason };
    }
    const reason = skipReason(deps);
    if (reason) {
      logDecision(deps, `others-skip:${reason}`, `Others start skipped: ${reason}.`);
      return { ran: false, skipped: reason };
    }
    const lock = deps.acquireRunLock("scrape");
    if (!lock.ok) {
      // Nothing is lost and no attempt is counted: the request stays waiting for the next check.
      logDecision(
        deps,
        `others-locked:${lock.holder?.kind}`,
        `Others start waiting: a ${lock.holder?.kind ?? "scrape or scoring"} run holds the lock (pid ${lock.holder?.pid}); leaving it for the next check.`
      );
      return { ran: false, skipped: "locked" };
    }
    lastLogged = null;
    try {
      return await runOthersWorkLocked(deps, record, nowMs);
    } finally {
      lock.release();
    }
  } catch (err) {
    deps.warn(`Others start failed: ${err.message}`);
    return { ran: false, skipped: "error" };
  }
}

async function runOthersWorkLocked(deps, record, nowMs) {
  const startedAt = iso(nowMs);
  const serving = record.requestedAt;
  // Counted when it starts, so a crash mid-run still uses up an attempt (same rule as new companies).
  deps.updateSchedulerStore((s) => ({
    ...s,
    othersWork: { ...s.othersWork, ...startAttempt(s.othersWork, nowMs) },
    lastRun: { startedAt, finishedAt: null, outcome: null, failedPhase: null, scored: 0, calls: 0, newJobs: 0, message: null, kind: "others" },
  }));
  const needsScrape = !scrapeIsFresh(deps.getState().meta?.lastScrapeAt ?? null, nowMs);
  deps.log(`started (Others start): ${needsScrape ? "scrape, then scoring" : "scoring only (the scrape is fresh)"}.`);

  const summary = { scored: 0, calls: 0, newJobs: 0, message: null };
  let failedPhase = null;
  try {
    if (needsScrape) {
      current = { phase: "scraping", startedAt };
      const scrape = await deps.runScrape();
      if (scrape.failed) {
        failedPhase = "scraping";
        summary.message = `Every source failed (${scrape.errorSources}); nothing was refreshed.`;
      } else {
        deps.log(`scrape finished: ${scrape.okSources} source(s) ok, ${scrape.errorSources} failed.`);
      }
    }
    if (!failedPhase) {
      current = { phase: "scoring", startedAt };
      // Read after the scrape, against the profile as it is now (the prefilter runs live).
      const onlyIds = deps.othersJobIds();
      const report = await deps.scoreJobs({ onlyIds, abortOnApiError: true, onCall: () => (summary.calls += 1) });
      summary.scored = report.scored?.length ?? 0;
      summary.newJobs = (report.scored ?? []).filter((x) => matchBand(x.score) !== null).length;
      if (report.status !== "ok") {
        failedPhase = "scoring";
        summary.message = report.reason ?? "Scoring did not run.";
      } else if (report.aborted) {
        failedPhase = "scoring";
        summary.message = `Scoring stopped on an API error: ${report.aborted}`;
      } else if ((report.leftByCeiling ?? 0) > 0) {
        summary.message = `${report.leftByCeiling} job(s) left for the next run (call ceiling).`;
      }
    }
  } catch (err) {
    failedPhase = failedPhase ?? (current?.phase === "scoring" ? "scoring" : "scraping");
    summary.message = err.message;
  }

  const finishedAt = iso(deps.now());
  const outcome = failedPhase ? "failed" : "done";
  deps.updateSchedulerStore((s) => ({
    ...s,
    // Done answers the click this run started with (a newer click stays waiting); a failure leaves
    // it waiting, gated by the backoff counted above.
    othersWork: failedPhase ? s.othersWork : { ...s.othersWork, servedRequestedAt: serving, ...clearAttempts },
    lastRun: { startedAt, finishedAt, outcome, failedPhase, ...summary, kind: "others" },
  }));
  current = null;
  if (failedPhase) {
    deps.warn(`Others start failed while ${failedPhase}: ${summary.message} (${summary.calls} call(s) made).`);
  } else {
    deps.log(`Others start finished: ${summary.scored} job(s) scored, ${summary.newJobs} newly visible, ${summary.calls} call(s).${summary.message ? ` ${summary.message}` : ""}`);
  }
  return { ran: true, outcome, failedPhase, ...summary };
}

/**
 * Runs the Others start in the background now, if nothing else is running. When a check or another
 * run is going, it returns at once: the request is already recorded, so the chained check at the
 * end of that run (or the next tick) picks it up.
 */
export async function triggerOthersWork(overrides = {}) {
  const deps = { ...defaultDeps, ...overrides };
  if (busy) {
    deps.log("Continue clicked while a scheduler check is running; the Others start waits for the end of that run.");
    return { ran: false, skipped: "busy" };
  }
  busy = true;
  let result;
  try {
    result = await runOthersWork(deps);
  } finally {
    current = null;
    busy = false;
  }
  if (result?.ran) await chainedCheck(deps);
  return result;
}

/**
 * The Continue click (POST /api/onboarding/start-others, via trigger.js): records the request in
 * data/scheduler.json, starts the work in the background and answers at once. Repeated clicks are
 * cheap: a fresh scrape is skipped and the scoring cache covers the rest. Returns { accepted,
 * reason? } (with a non-enumerable `settled` promise for tests).
 */
export function requestOthersWork(overrides = {}) {
  const deps = { ...defaultDeps, ...overrides };
  const reason = skipReason(deps);
  if (reason) return { accepted: false, reason };
  deps.updateSchedulerStore((s) => ({ ...s, othersWork: { ...(s.othersWork ?? {}), requestedAt: iso(deps.now()) } }));
  const answer = { accepted: true };
  Object.defineProperty(answer, "settled", { value: triggerOthersWork(overrides).catch(() => {}), enumerable: false });
  return answer;
}

async function runLocked(deps, decision, store, nowMs) {
  const startedAt = iso(nowMs);
  const sameSlot = store.slot && new Date(store.slot.start).getTime() === decision.slotStart;
  const attempts = (sameSlot ? store.slot.attempts : 0) + 1;
  const slotStart = iso(decision.slotStart);
  // Counted at the start, so a crash mid-run still uses up an attempt.
  deps.updateSchedulerStore((s) => ({
    ...s,
    slot: { start: slotStart, attempts, lastAttemptAt: startedAt, scoringDone: sameSlot ? store.slot.scoringDone : false },
    lastRun: { startedAt, finishedAt: null, outcome: null, failedPhase: null, scored: 0, calls: 0, newJobs: 0, message: null },
  }));
  deps.log(`started (${decision.reason}, attempt ${attempts} of ${MAX_ATTEMPTS_PER_SLOT}): ${decision.needsScrape ? "scrape, then scoring" : "scoring only (the scrape is already done)"}.`);

  const summary = { scored: 0, calls: 0, newJobs: 0, message: null };
  let failedPhase = null;
  let scoringDone = false;

  try {
    if (decision.needsScrape) {
      current = { phase: "scraping", startedAt };
      const scrape = await deps.runScrape();
      if (scrape.failed) {
        failedPhase = "scraping";
        summary.message = `Every source failed (${scrape.errorSources}); nothing was refreshed.`;
      } else {
        deps.log(`scrape finished: ${scrape.okSources} source(s) ok, ${scrape.errorSources} failed.`);
      }
    }

    if (!failedPhase) {
      current = { phase: "scoring", startedAt };
      const report = await deps.scoreJobs({ abortOnApiError: true, onCall: () => (summary.calls += 1) });
      summary.scored = report.scored?.length ?? 0;
      summary.newJobs = (report.scored ?? []).filter((s) => matchBand(s.score) !== null).length;
      if (report.status !== "ok") {
        failedPhase = "scoring";
        summary.message = report.reason ?? "Scoring did not run.";
      } else if (report.aborted) {
        failedPhase = "scoring";
        summary.message = `Scoring stopped on an API error: ${report.aborted}`;
      } else {
        // Whatever the ceiling or rejected answers left is picked up tomorrow, not retried today.
        scoringDone = true;
        const left = report.leftByCeiling ?? 0;
        if (left > 0) summary.message = `${left} job(s) left for the next run (call ceiling).`;
      }
    }
  } catch (err) {
    failedPhase = failedPhase ?? (current?.phase === "scoring" ? "scoring" : "scraping");
    summary.message = err.message;
  }

  const finishedAt = iso(deps.now());
  const outcome = failedPhase ? "failed" : "done";
  deps.updateSchedulerStore((s) => ({
    ...s,
    slot: { ...s.slot, scoringDone: scoringDone || (s.slot?.scoringDone ?? false) },
    lastRun: { startedAt, finishedAt, outcome, failedPhase, ...summary },
  }));
  current = null;

  if (failedPhase) {
    deps.warn(`failed while ${failedPhase === "scraping" ? "scraping" : "scoring"}: ${summary.message} (${summary.calls} call(s) made, ${summary.scored} job(s) scored).`);
  } else {
    deps.log(`finished: ${summary.scored} job(s) scored, ${summary.newJobs} newly visible, ${summary.calls} call(s).${summary.message ? ` ${summary.message}` : ""}`);
  }
  return { ran: true, outcome, failedPhase, ...summary };
}

/**
 * The state for GET /api/jobs/update-status. Reads only (this process's memory and
 * data/scheduler.json), never starts a run, never calls the AI.
 */
export function getUpdateStatus(deps = defaultDeps) {
  if (current) {
    return {
      state: "running",
      phase: current.phase,
      startedAt: current.startedAt,
      finishedAt: null,
      outcome: null,
      failedPhase: null,
      newJobs: 0,
      message: null,
    };
  }
  const last = deps.getSchedulerStore().lastRun;
  if (!last) {
    return { state: "idle", phase: null, startedAt: null, finishedAt: null, outcome: null, failedPhase: null, newJobs: 0, message: null };
  }
  // A record that never finished belongs to a process that died mid-run.
  const interrupted = !last.finishedAt;
  const failed = interrupted || last.outcome === "failed";
  return {
    state: failed ? "failed" : "idle",
    phase: null,
    startedAt: last.startedAt,
    finishedAt: last.finishedAt ?? null,
    outcome: interrupted ? "failed" : last.outcome,
    failedPhase: interrupted ? null : last.failedPhase ?? null,
    newJobs: last.newJobs ?? 0,
    message: interrupted ? "The server stopped during the last update." : last.message ?? null,
  };
}

// Marks a run left unfinished by a dead process as failed in the file too (its attempt was already
// counted when it started, so a crash loop can't run past the daily cap).
function recoverInterrupted(deps) {
  const last = deps.getSchedulerStore().lastRun;
  if (last && !last.finishedAt) {
    deps.updateSchedulerStore((s) => ({
      ...s,
      lastRun: { ...s.lastRun, finishedAt: iso(deps.now()), outcome: "failed", failedPhase: null, message: "The server stopped during the last update." },
    }));
    deps.warn("the previous scheduled run was interrupted; marked as failed.");
  }
}

let timer = null;

/** Called once from server/index.js. Returns at once; the first check runs about a second later. */
export function startScheduler() {
  const off = ["off", "0", "false"].includes(String(process.env.APPLYMATE_SCHEDULER ?? "").toLowerCase());
  if (off) {
    console.log("[scheduler] disabled (APPLYMATE_SCHEDULER=off).");
    return;
  }
  // node --test sets this in every test process: a test that imports the server can't start it.
  if (process.env.NODE_TEST_CONTEXT) return;
  if (timer) return;

  try {
    recoverInterrupted(defaultDeps);
  } catch (err) {
    console.warn(`[scheduler] could not read its record: ${err.message}`);
  }
  console.log("[scheduler] on: a run is due after each 9:00 AM Pacific; checking now and every 15 minutes. A watchlist save also detects and scrapes new companies, and the Role page's Continue starts the Others scrape and scoring.");
  setWatchlistSavedHandler(() => triggerCompanyWork());
  setOthersStartHandler(() => requestOthersWork());
  setCompanyRetryHandler(() => requestCompanyRetry());
  setTimeout(() => void runTick(), FIRST_TICK_DELAY_MS).unref();
  timer = setInterval(() => void runTick(), TICK_MS);
  timer.unref();
}

// Test hooks: reset the module's memory between tests.
export function resetSchedulerForTests() {
  current = null;
  busy = false;
  lastLogged = null;
}

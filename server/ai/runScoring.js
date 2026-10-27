import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getState, updateState, getJobsStore, getResumesStore, getScoresStore, updateScoresStore, getExemptJobIds } from "../store/store.js";
import { acquireRunLock } from "../store/runLock.js";
import { filterJobs } from "../scraper/filterJobs.js";
import { loadOthersConfig, buildWatchlistDedupKeys, isOthersEntryOnWatchlist, normalizeDomain } from "../scraper/othersDedup.js";
import { scoreJob, SCORING_VERSION, ScoreRejectedError } from "./scoreJob.js";
import { estimateCostUsd } from "./client.js";
import { matchBand, shownScore, MIN_SHOWN_SCORE } from "./matchBand.js";

// A hard stop on spend per run, not a target. Whatever is left is reported and picked up next run.
export const DEFAULT_MAX_CALLS = 150;
const CONCURRENCY = 3;
// An answer the checks in scoreJob.js reject is retried on later runs, up to this many attempts
// in total for the same resume version + SCORING_VERSION; then the job is left unscored and listed
// under "gaveUp" in every run's report (unscored jobs are hidden in the UI, so this is the only
// place they show up). API and network errors don't count: they always retry on the next run.
const MAX_REJECTED_ATTEMPTS = 3;

// Cache key: job id + resume version + SCORING_VERSION + the years of experience the model was
// given, so editing years on the Role page rescores on the next run.
export function isScoreCurrent(entry, resumeVersion, yearsOfExperience) {
  return (
    Boolean(entry) &&
    entry.resumeVersion === resumeVersion &&
    entry.scoringVersion === SCORING_VERSION &&
    (entry.yearsOfExperience ?? null) === yearsOfExperience
  );
}

// The years the model is told. The profile's value is what the person confirmed on the Role page
// (the extraction can be off: it once counted a role that had ended up to today), so it wins when
// the profile belongs to this resume; otherwise the extraction's value for this resume.
function yearsForScoring(state, resumes, resumeVersion) {
  const profile = state.profile;
  if (profile?.resumeVersion === resumeVersion && Number.isInteger(profile.yearsOfExperience)) {
    return profile.yearsOfExperience;
  }
  const extracted = resumes.versions[resumeVersion]?.extraction?.fields?.yearsOfExperience;
  return Number.isInteger(extracted) ? extracted : null;
}

/**
 * The jobs worth a model call: open, inside the freshness window and passing the plain-code
 * prefilter — the same filterJobs the list view uses. Watchlist first, then Others, each newest
 * first, so a run cut short by the ceiling spends on the Watchlist before the long tail.
 *
 * Others jobs are stored broadly at scrape time (every fresh US / US-remote job) and filtered
 * against the profile here, the same way GET /api/jobs does.
 */
export function selectEligibleJobs(state, jobs, now = Date.now()) {
  const profile = state.profile;
  // Saved and applied-to jobs skip the 60-day freshness rule.
  const savedJobIds = [...getExemptJobIds(state)];
  const open = jobs.filter((j) => !j.closed);

  const watchlistIds = new Set(
    state.watchlist.filter((c) => state.companyMeta?.[c.id]?.scrapeStatus === "ok").map((c) => c.id)
  );
  const watchlist = filterJobs({
    jobs: open.filter((j) => watchlistIds.has(j.company?.id)),
    profile,
    savedJobIds,
    now,
  }).passed;

  // Same re-check as GET /api/jobs: an Others company added to the watchlist since the last scrape
  // is no longer shown under Others, so it isn't scored as one either.
  const dedupKeys = buildWatchlistDedupKeys(state);
  const othersConfigByDomain = new Map(loadOthersConfig().map((e) => [normalizeDomain(e.domain), e]));
  const others = filterJobs({
    jobs: open.filter((j) => {
      if (!j.company?.id?.startsWith("others:")) return false;
      const entry = othersConfigByDomain.get(normalizeDomain(j.company.domain));
      return !entry || !isOthersEntryOnWatchlist(entry, dedupKeys);
    }),
    profile,
    savedJobIds,
    now,
  }).passed;

  const newestFirst = (a, b) =>
    new Date(b.postedAt ?? b.firstSeenAt).getTime() - new Date(a.postedAt ?? a.firstSeenAt).getTime();

  return [
    ...[...watchlist].sort(newestFirst).map((job) => ({ job, tab: "watchlist" })),
    ...[...others].sort(newestFirst).map((job) => ({ job, tab: "others" })),
  ];
}

/**
 * Eligible jobs whose score for the current resume is below MIN_SHOWN_SCORE: hidden in the app
 * (server/ai/matchBand.js), so the end of every run's report lists them for auditing the scoring.
 * Lowest score first. Reads the scores store fresh, so it includes this run's new scores.
 */
export function hiddenBelowMinimum(eligible, resumeVersion, scoresOverride = null) {
  const scores = scoresOverride ?? getScoresStore().scores;
  return eligible
    .map(({ job, tab }) => ({ job, tab, entry: scores[job.id] }))
    .filter(({ entry }) => entry && entry.resumeVersion === resumeVersion && matchBand(entry.score) === null)
    .map(({ job, tab, entry }) => ({
      company: job.company?.name,
      title: job.title,
      score: shownScore(entry.score),
      reasoning: entry.reasoning,
      tab,
      id: job.id,
    }))
    .sort((a, b) => a.score - b.score);
}

async function runPool(items, limit, worker, shouldStop = () => false) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !shouldStop()) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

/**
 * Scores every eligible job that has no score for the current cache key
 * (job id + resume version + SCORING_VERSION), up to maxCalls calls.
 * `onlyIds` restricts the run to those job ids (they must still be eligible) — used for spot tests.
 * `dryRun` reports what would be scored without calling the API.
 * Never throws for a single job's failure: that job is logged and stays unscored for the next run.
 *
 * `replacement` (Change Preferences > Resume, server/ai/replaceResume.js) scores a resume that is
 * not active yet: { resumeVersion, resumeText, yearsOfExperience }. Its scores and rejection
 * records go to `pending` in the scores store, so the active resume's scores keep showing until
 * the switch merges them. The years are passed explicitly (they must match what the runs after the
 * switch will use). An API-level error (anything but a rejected answer) stops the run at once:
 * report.aborted holds the message and no further call is made.
 *
 * `abortOnApiError` gives a normal (non-replacement) run the same stop-at-first-API-error rule; the
 * scheduler sets it. The CLI keeps its old behavior.
 *
 * `onCall()` runs once after each model call returns or fails (not for a job refused before any
 * call, e.g. one with no description), so a caller can count the calls a run made.
 */
export async function scoreJobs({ maxCalls = DEFAULT_MAX_CALLS, onlyIds = null, dryRun = false, replacement = null, onCall = null, abortOnApiError = false } = {}) {
  const runStartedAt = new Date().toISOString();
  const resumes = getResumesStore();
  const resumeVersion = replacement ? replacement.resumeVersion : resumes.currentVersion;
  const resumeText = replacement ? replacement.resumeText : resumeVersion ? resumes.versions[resumeVersion]?.text : null;
  const state = getState();
  const yearsOfExperience = replacement
    ? replacement.yearsOfExperience
    : yearsForScoring(state, resumes, resumeVersion);
  if (!resumeText) {
    return { status: "skipped", reason: "No current resume text to score against." };
  }

  const eligible = selectEligibleJobs(state, getJobsStore().jobs);
  // The pending store only counts when it belongs to this resume version.
  const readStore = () => {
    const store = getScoresStore();
    if (!replacement) return { scores: store.scores, failures: store.failures ?? {} };
    const pending = store.pending?.resumeVersion === resumeVersion ? store.pending : null;
    return { scores: pending?.scores ?? {}, failures: pending?.failures ?? {} };
  };
  // Writes go to the live scores, or to `pending` while a replacement is being scored.
  const writeStore = (mutate) =>
    updateScoresStore((s) => {
      if (!replacement) return { ...s, ...mutate({ scores: s.scores, failures: s.failures ?? {} }) };
      const pending = s.pending?.resumeVersion === resumeVersion ? s.pending : { resumeVersion, scores: {}, failures: {} };
      return { ...s, pending: { ...pending, ...mutate({ scores: pending.scores, failures: pending.failures ?? {} }) } };
    });
  const { scores, failures } = readStore();
  const failureKey = `${resumeVersion}|${SCORING_VERSION}|${yearsOfExperience}`;
  const hasGivenUp = (id) => failures[id]?.key === failureKey && failures[id].attempts >= MAX_REJECTED_ATTEMPTS;
  const unscored = eligible.filter(({ job }) => !isScoreCurrent(scores[job.id], resumeVersion, yearsOfExperience));
  const gaveUp = unscored
    .filter(({ job }) => hasGivenUp(job.id))
    .map(({ job, tab }) => ({ id: job.id, tab, title: job.title, company: job.company?.name, attempts: failures[job.id].attempts, lastError: failures[job.id].lastError }));
  let todo = unscored.filter(({ job }) => !hasGivenUp(job.id));

  const notEligible = [];
  if (onlyIds) {
    const wanted = new Set(onlyIds);
    const eligibleIds = new Set(eligible.map(({ job }) => job.id));
    notEligible.push(...onlyIds.filter((id) => !eligibleIds.has(id)));
    todo = todo.filter(({ job }) => wanted.has(job.id));
  }

  const batch = todo.slice(0, maxCalls);
  const report = {
    status: "ok",
    resumeVersion: resumeVersion.slice(0, 12),
    yearsOfExperience,
    scoringVersion: SCORING_VERSION,
    eligible: eligible.length,
    alreadyCurrent: eligible.length - unscored.length,
    toScore: todo.length,
    attempted: dryRun ? 0 : batch.length,
    leftByCeiling: todo.length - batch.length,
    scored: [],
    failed: [],
    gaveUp,
    costUsd: 0,
    ...(notEligible.length ? { notEligible } : {}),
  };
  if (dryRun) {
    report.status = "dry-run";
    report.wouldScore = batch.map(({ job, tab }) => ({ id: job.id, tab, title: job.title, company: job.company?.name }));
    report[`hiddenBelow${MIN_SHOWN_SCORE}`] = hiddenBelowMinimum(eligible, resumeVersion, replacement ? scores : null);
    return report;
  }

  let aborted = false;
  await runPool(batch, CONCURRENCY, async ({ job, tab }) => {
    try {
      const { usage, ...result } = await scoreJob({ job, resumeText, resumeVersion, yearsOfExperience });
      onCall?.();
      report.costUsd += estimateCostUsd(result.model, usage) ?? 0;
      const entry = { jobId: job.id, resumeVersion, yearsOfExperience, scoredAt: new Date().toISOString(), ...result };
      // Synchronous read-modify-write, so the three lanes can't interleave and drop each other's entries.
      writeStore((s) => {
        const failures = { ...s.failures };
        delete failures[job.id];
        return { scores: { ...s.scores, [job.id]: entry }, failures };
      });
      report.scored.push({ id: job.id, tab, title: job.title, company: job.company?.name, score: result.score, band: matchBand(result.score) ?? "hidden", warnings: result.warnings });
    } catch (err) {
      // API failures are already in ai-usage.jsonl; this covers rejected output too.
      const rejected = err instanceof ScoreRejectedError;
      // A rejected answer carries the model it came from; one refused before any call does not.
      if (!rejected || err.model) onCall?.();
      if (rejected) {
        report.costUsd += estimateCostUsd(err.model, err.usage) ?? 0;
        writeStore((s) => {
          const prev = s.failures?.[job.id];
          const attempts = (prev?.key === failureKey ? prev.attempts : 0) + 1;
          const record = { key: failureKey, attempts, lastError: err.message, lastAt: new Date().toISOString() };
          return { failures: { ...s.failures, [job.id]: record } };
        });
      } else if (replacement || abortOnApiError) {
        // An API-level error (auth, credits, network, rate limit) ends a replacement run, and a
        // scheduled run (abortOnApiError): no point firing the rest of the batch at a failing API.
        aborted = true;
        report.aborted = err.message;
      }
      console.warn(`[score] ${job.id} (${job.title}) ${rejected ? "output rejected" : "failed"}: ${err.message}`);
      report.failed.push({ id: job.id, tab, title: job.title, kind: rejected ? "rejected-output" : "api-error", error: err.message });
    }
  }, () => aborted);

  report.costUsd = Number(report.costUsd.toFixed(6));
  // A run that left nothing unscored brings the scores current: a "needs refresh" mark from a Details
  // edit made before this run started has nothing left to do (refreshScores.js).
  if (!replacement && !aborted && report.leftByCeiling === 0 && report.failed.length === 0) {
    updateState((s) => {
      const rec = s.scoringRefresh;
      if (!rec?.pending || (rec.editedAt && rec.editedAt > runStartedAt) || rec.state === "running") return s;
      return { ...s, scoringRefresh: { ...rec, pending: false, state: "idle" } };
    });
  }
  if (report.leftByCeiling > 0) {
    console.warn(`[score] Hit the ${maxCalls}-call ceiling; ${report.leftByCeiling} job(s) left for the next run.`);
  }
  if (gaveUp.length > 0) {
    console.warn(`[score] ${gaveUp.length} job(s) left unscored after ${MAX_REJECTED_ATTEMPTS} rejected answers; see "gaveUp".`);
  }
  // Kept as the report's last key so it prints at the end of score:jobs / fetch:jobs output.
  report[`hiddenBelow${MIN_SHOWN_SCORE}`] = hiddenBelowMinimum(eligible, resumeVersion, replacement ? readStore().scores : null);
  return report;
}

function parseArgs(argv) {
  const args = { maxCalls: DEFAULT_MAX_CALLS, onlyIds: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--max") args.maxCalls = Number(argv[++i]);
    else if (argv[i] === "--ids") args.onlyIds = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (!Number.isInteger(args.maxCalls) || args.maxCalls < 0) throw new Error("--max must be a whole number");
  return args;
}

// npm run score:jobs [-- --dry-run] [-- --max N] [-- --ids id1,id2]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  dotenv.config();
  const args = parseArgs(process.argv.slice(2));
  // A dry run makes no call and writes nothing, so it needs no lock.
  const lock = args.dryRun ? { ok: true, release() {} } : acquireRunLock("score");
  if (!lock.ok) {
    console.error(`[score] Not started: a ${lock.holder?.kind ?? "scrape or scoring"} run is already in progress (pid ${lock.holder?.pid}).`);
    process.exit(1);
  }
  try {
    const report = await scoreJobs(args);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    lock.release();
  }
}

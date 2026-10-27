import { fileURLToPath } from "node:url";
import { getState, updateState, getJobsStore, updateJobsStore, getExemptJobIds } from "../store/store.js";
import { acquireRunLock } from "../store/runLock.js";
import { isFresh } from "./filterJobs.js";
import { isUsOrUsRemote } from "./jobLocation.js";
import { statesNoSponsorship } from "./postingFacts.js";
import { loadOthersConfig, buildWatchlistDedupKeys, isOthersEntryOnWatchlist, normalizeDomain } from "./othersDedup.js";
import dotenv from "dotenv";
import { scoreJobs } from "../ai/runScoring.js";
import registry from "./adapters/registry.js";
import { sleep } from "./adapters/http.js";

const COMPANY_DELAY_MS = 1500;

// firstSeenAt is always the real moment ApplyMate first saw the job — never backdated — so it stays
// trustworthy for "found X ago" and any other display. A company's first scrape would otherwise stamp
// every job with firstSeenAt = now, which, once a red-dot check compares firstSeenAt against
// lastViewed, would make an entire newly-detected company look like a pile of "new" jobs instead of
// an initial backfill. isInitialScrape carries that fact instead, on the job itself, so a future
// red-dot check can exclude initial backfills without the dates lying about when they were found.
// Both exported standalone so they can be verified without touching the real store.
export function decideFirstSeenAt({ existingJob, nowIso }) {
  return existingJob ? existingJob.firstSeenAt : nowIso;
}

export function decideIsInitialScrape({ existingJob, isFirstScrapeForCompany }) {
  // existingJob.isInitialScrape ?? true: jobs written before this flag existed get treated as
  // initial-scrape (the safe default — never a false "new" dot) rather than left undefined forever.
  if (existingJob) return existingJob.isInitialScrape ?? true;
  return isFirstScrapeForCompany;
}

// A job's id: the adapter's own format, else <companyId>:<rawId>.
function jobIdFor(adapter, raw, company) {
  return adapter.jobId ? adapter.jobId(raw, company) : `${company.id}:${adapter.rawId(raw)}`;
}

// Returns null for a stored source this build has no adapter for (an old store): unsupported, not a
// failure; the caller skips the company (logged once per source id by the registry).
async function scrapeCompany(company, meta, allJobs) {
  if (!registry.isSupported(meta.atsPlatform)) return null;
  const platform = registry.getAdapter(meta.atsPlatform);
  const rawJobs = await platform.fetchJobs(meta.atsSlug);

  const existingJobs = allJobs.filter((j) => j.company?.id === company.id);
  const existingById = new Map(existingJobs.map((j) => [j.id, j]));
  const isFirstScrapeForCompany = existingJobs.length === 0;
  const nowIso = new Date().toISOString();

  const freshJobs = rawJobs.map((raw) => {
    const id = jobIdFor(platform, raw, company);
    const normalized = platform.normalize(raw, company);
    const existingJob = existingById.get(id) ?? null;
    const firstSeenAt = decideFirstSeenAt({ existingJob, nowIso });
    const isInitialScrape = decideIsInitialScrape({ existingJob, isFirstScrapeForCompany });

    // noSponsorship: the posting says it won't sponsor a visa (plain-code text check). Stored for
    // display later; it only filters jobs for a profile that needs sponsorship (filterJobs.js).
    return {
      id, ...normalized, firstSeenAt, isInitialScrape, closed: false,
      noSponsorship: statesNoSponsorship(normalized.descriptionText), ai: existingJob?.ai ?? null,
    };
  });

  const freshIds = new Set(freshJobs.map((j) => j.id));
  const closedJobs = existingJobs.filter((j) => !freshIds.has(j.id)).map((j) => ({ ...j, closed: true }));

  return {
    companyJobs: [...freshJobs, ...closedJobs],
    stats: {
      fetched: rawJobs.length,
      newJobs: freshJobs.filter((j) => !existingById.has(j.id)).length,
      closedJobs: closedJobs.length,
      firstScrape: isFirstScrapeForCompany,
    },
  };
}

// Others has a different storage policy than Watchlist: the full curated list is ~7,000 raw jobs,
// most of them outside the US or long stale. Only jobs that are in the US (or US-remote) and inside
// the freshness window are stored, with no profile check, so GET /api/jobs can filter them
// against the current profile on every request and a profile edit takes effect immediately.
// Each scrape fully replaces a company's Others jobs rather than diffing/closing — a job that drops
// out (closed, or now stale) simply isn't written this time.
// Jobs exempt from the Others filters and from every purge: saved jobs and jobs with an application
// record (getExemptJobIds). Read from the store at the moment it's needed, never from a snapshot
// taken at the start of the run: the Others pass takes minutes, and a job saved or applied to in
// the app meanwhile must still be kept.

// exemptJobIds is optional (for checking this function without the real store); by default the ids
// are read after the fetch, right before the result is built.
export async function scrapeOthersCompany(entry, companyId, existingJobs, exemptJobIds = null) {
  if (!registry.isSupported(entry.atsPlatform)) return null;
  const platform = registry.getAdapter(entry.atsPlatform);
  const rawJobs = await platform.fetchJobs(entry.atsSlug);

  const existingForCompany = existingJobs.filter((j) => j.company?.id === companyId);
  const existingById = new Map(existingForCompany.map((j) => [j.id, j]));
  const nowIso = new Date().toISOString();
  const company = { id: companyId, name: entry.name, domain: entry.domain };

  const normalizedJobs = rawJobs.map((raw) => {
    const id = `${companyId}:${platform.rawId(raw)}`;
    const normalized = platform.normalize(raw, company);
    const existingJob = existingById.get(id) ?? null;
    return {
      id, ...normalized, firstSeenAt: existingJob?.firstSeenAt ?? nowIso, closed: false,
      noSponsorship: statesNoSponsorship(normalized.descriptionText), ai: existingJob?.ai ?? null,
    };
  });

  const jobs = applyOthersFilters({ normalizedJobs, existingForCompany, exemptSet: new Set(exemptJobIds ?? getExemptJobIds()) });
  return { jobs, fetched: rawJobs.length, stored: jobs.length };
}

/**
 * The Others freshness and US filters, with the exemption. Saved jobs and jobs with an application
 * record (any status) must never be dropped by the full-replace, even if they no longer pass
 * freshness or the US check, the same guarantee Watchlist gives every job by never deleting, only
 * marking closed. An exempt job still in this fetch is kept at its live, current data (just no
 * longer filtered in); one that has vanished from the ATS feed entirely is carried forward from
 * what was last stored and marked closed instead of disappearing.
 */
export function applyOthersFilters({ normalizedJobs, existingForCompany, exemptSet, nowMs = Date.now() }) {
  const passed = normalizedJobs.filter((j) => isFresh(j, nowMs) && isUsOrUsRemote(j));
  const passedIds = new Set(passed.map((j) => j.id));
  const normalizedById = new Map(normalizedJobs.map((j) => [j.id, j]));
  const existingById = new Map(existingForCompany.map((j) => [j.id, j]));
  // The exempt ids are the union of "currently fetched" and "previously stored": an exempt job
  // can fail the US check the very first time it is fetched, not only on a later re-scrape.
  const idsToKeep = new Set(
    [...normalizedJobs, ...existingForCompany]
      .map((j) => j.id)
      .filter((id) => exemptSet.has(id) && !passedIds.has(id))
  );
  const keptJobs = [...idsToKeep].map((id) => normalizedById.get(id) ?? { ...existingById.get(id), closed: true });
  return [...passed, ...keptJobs];
}

/**
 * Drops stored Watchlist jobs for companies no longer on the watchlist (removed companies are
 * never scraped again, so their jobs would otherwise sit in jobs.json forever). Saved jobs and jobs
 * with an application record are kept. Returns how many jobs were removed.
 */
export function purgeRemovedWatchlistJobs() {
  const state = getState();
  const watchlistIds = new Set(state.watchlist.map((c) => c.id));
  const exempt = getExemptJobIds(state);
  const keep = (j) => j.company?.id?.startsWith("others:") || watchlistIds.has(j.company?.id) || exempt.has(j.id);
  const { jobs } = getJobsStore();
  const removed = jobs.filter((j) => !keep(j)).length;
  if (removed > 0) updateJobsStore((s) => ({ ...s, jobs: s.jobs.filter(keep) }));
  return removed;
}

/** Drops Others jobs of companies not in keptOthersCompanyIds; exempt jobs (saved, applied to) stay. */
export function purgeStaleOthersJobs(keptOthersCompanyIds) {
  const exempt = getExemptJobIds();
  updateJobsStore((s) => ({
    ...s,
    jobs: s.jobs.filter(
      (j) => !j.company?.id?.startsWith("others:") || keptOthersCompanyIds.has(j.company.id) || exempt.has(j.id)
    ),
  }));
}

/**
 * The scrape half of `fetch:jobs` (Watchlist + Others), no scoring, no lock (the caller
 * holds data/run.lock). Returns { report, okSources, errorSources, failed }. `failed` is true when
 * sources were attempted and every one errored (offline, blocked): nothing was refreshed, so
 * lastScrapeAt is NOT written (the header must not claim fresh data) and the scheduler treats the
 * scrape as failed. A partial failure still counts as a scrape: the failed sources keep their jobs.
 */
export async function runScrape({ companyIds = null } = {}) {
  const state = getState();
  // `companyIds` makes this a targeted scrape (newly added watchlist companies, see
  // server/scheduler/newCompanies.js): only those companies, no Others, no purges, and
  // lastScrapeAt is NOT written (it is the full scrape's marker for the daily scheduler).
  const targeted = Array.isArray(companyIds);
  const wanted = targeted ? new Set(companyIds) : null;
  const companies = state.watchlist.filter((c) => {
    const meta = state.companyMeta?.[c.id];
    return meta?.scrapeStatus === "ok" && meta.atsPlatform && meta.atsSlug && (!targeted || wanted.has(c.id));
  });

  const report = [];

  for (const company of companies) {
    const meta = state.companyMeta[company.id];
    const { jobs: currentJobs } = getJobsStore();

    let result;
    try {
      result = await scrapeCompany(company, meta, currentJobs);
    } catch (err) {
      // Fetch failed: existing jobs for this company are left completely untouched —
      // no closing, no firstSeenAt changes, nothing written for this company at all.
      report.push({ companyId: company.id, company: company.name, platform: meta.atsPlatform, status: "error", detail: err.message });
      await sleep(COMPANY_DELAY_MS);
      continue;
    }

    if (result === null) {
      report.push({ companyId: company.id, company: company.name, platform: meta.atsPlatform, status: "skipped", reason: "source not supported in this build" });
      continue;
    }

    report.push({ companyId: company.id, company: company.name, platform: meta.atsPlatform, status: "ok", ...result.stats });

    updateJobsStore((s) => ({
      ...s,
      jobs: [...s.jobs.filter((j) => j.company?.id !== company.id), ...result.companyJobs],
    }));

    await sleep(COMPANY_DELAY_MS);
  }

  if (targeted) return finishScrape(report, { writeLastScrapeAt: false });

  // Others: the curated list, minus anything that's also on the watchlist — "a company on both
  // lists belongs to the Watchlist only." Matched by ATS platform + slug (via companyMeta), the
  // same board however its name/domain is spelled on each list; domain is only a fallback for a
  // watchlist company with no confirmed board yet to match a platform+slug against.
  const othersConfig = loadOthersConfig();
  const dedupKeys = buildWatchlistDedupKeys(state);
  const keptOthersCompanyIds = new Set();

  for (const entry of othersConfig) {
    const companyId = `others:${normalizeDomain(entry.domain)}`;

    if (isOthersEntryOnWatchlist(entry, dedupKeys)) {
      report.push({ company: entry.name, tab: "others", status: "skipped", reason: "already on watchlist" });
      continue;
    }

    // Processed (not skipped) — its existing jobs should survive even if this run errors below.
    keptOthersCompanyIds.add(companyId);

    const { jobs: currentJobs } = getJobsStore();
    let result;
    try {
      result = await scrapeOthersCompany(entry, companyId, currentJobs);
    } catch (err) {
      // Same rule as Watchlist: a failed fetch leaves whatever's already stored untouched.
      report.push({ company: entry.name, tab: "others", platform: entry.atsPlatform, status: "error", detail: err.message });
      await sleep(COMPANY_DELAY_MS);
      continue;
    }

    if (result === null) {
      report.push({ company: entry.name, tab: "others", platform: entry.atsPlatform, status: "skipped", reason: "source not supported in this build" });
      continue;
    }

    report.push({
      company: entry.name,
      tab: "others",
      platform: entry.atsPlatform,
      status: "ok",
      fetched: result.fetched,
      stored: result.stored,
    });

    updateJobsStore((s) => ({
      ...s,
      jobs: [...s.jobs.filter((j) => j.company?.id !== companyId), ...result.jobs],
    }));

    await sleep(COMPANY_DELAY_MS);
  }

  // Purge Others jobs for companies that dropped out of the config entirely or moved onto the
  // watchlist this run — anything left over from an earlier scrape that's no longer valid. Saved
  // and applied-to jobs are exempt here too, same as the per-company full-replace above (read
  // fresh, not from the start of the run).
  purgeStaleOthersJobs(keptOthersCompanyIds);
  purgeRemovedWatchlistJobs();

  return finishScrape(report, { writeLastScrapeAt: true });
}

function finishScrape(report, { writeLastScrapeAt }) {
  const okSources = report.filter((r) => r.status === "ok").length;
  const errorSources = report.filter((r) => r.status === "error").length;
  const failed = okSources === 0 && errorSources > 0;

  // Deliberately last: every per-company jobs.json write above already happened (or this
  // company's write threw and aborted the run before reaching here). lastScrapeAt must never
  // land before the jobs it describes, or the header could claim fresher data than is on disk.
  if (writeLastScrapeAt && !failed) updateState((s) => ({ ...s, meta: { ...s.meta, lastScrapeAt: new Date().toISOString() } }));

  // Watchlist companies by id, for callers that act per company (targeted runs).
  const okCompanyIds = report.filter((r) => r.status === "ok" && r.companyId).map((r) => r.companyId);
  const errorCompanyIds = report.filter((r) => r.status === "error" && r.companyId).map((r) => r.companyId);
  return { report, okSources, errorSources, failed, okCompanyIds, errorCompanyIds };
}

async function run({ score = true } = {}) {
  const { report, failed } = await runScrape();
  console.log(JSON.stringify(report, null, 2));
  if (failed) console.warn("[fetch] Every source failed; lastScrapeAt was not updated.");

  // Scoring runs after the scrape is fully written, so it sees this run's jobs. A scoring failure
  // never undoes the scrape; unscored jobs are picked up by the next run. --no-score skips it.
  if (!score) {
    console.log("[score] skipped (--no-score)");
    return;
  }
  try {
    console.log(JSON.stringify({ scoring: await scoreJobs() }, null, 2));
  } catch (err) {
    console.warn(`[score] scoring run failed: ${err.message}`);
  }
}

// `--dry-run <source id>`: asks one adapter to fetch and print a sample; writes nothing.
async function dryRun(id) {
  const adapter = registry.getAdapter(id);
  if (!adapter) throw new Error(`no source "${id}". Supported: ${registry.supportedSources().map((s) => s.id).join(", ")}`);
  if (!adapter.dryRun) throw new Error(`source "${id}" has no dry run`);
  await adapter.dryRun();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  dotenv.config();
  const dryRunAt = process.argv.indexOf("--dry-run");
  if (dryRunAt !== -1) {
    dryRun(process.argv[dryRunAt + 1]).catch((err) => { console.error(`dry run failed: ${err.message}`); process.exitCode = 1; });
  } else {
    // One scrape / scoring / resume-replacement run at a time (data/run.lock).
    const lock = acquireRunLock("scrape");
    if (!lock.ok) {
      console.error(`[fetch] Not started: a ${lock.holder?.kind ?? "scrape or scoring"} run is already in progress (pid ${lock.holder?.pid}).`);
      process.exit(1);
    }
    run({ score: !process.argv.includes("--no-score") }).finally(() => lock.release());
  }
}

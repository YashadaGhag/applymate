import { mostRecentSlot, RETRY_DELAYS_MS, MAX_ATTEMPTS_PER_SLOT } from "./dueTime.js";

// Which watchlist companies need background work (detect a source, then scrape it), as plain
// functions of the stored data. Nothing is queued anywhere: "waiting" is derived from companyMeta,
// so a save made while the run lock was busy is simply picked up by the next scheduler tick.
//
// Per company, in companyMeta (server-owned):
//   no entry                      a NEW company: needs detection
//   scrapeStatus "error"          detection could not tell (network): retried, with backoff
//   scrapeStatus "ok" + scrapePending   detected, first scrape not done yet: needs a scrape
//   scrapeStatus "no_source"      nothing to do and never re-probed here (`detect:ats --force` does);
//                                 `noSourceAt` records when, for the Company Watchlist notice
//   anything else                 nothing to do (companies set up before this feature have no
//                                 scrapePending, so they are not re-scraped by it)
// Failure backoff reuses the scheduler's idea: attempts are counted when a stage STARTS, per 9 AM
// Pacific slot; after the first failure wait 30 minutes, after the second 2 hours, then stop until
// the next slot. workAttempts / workLastAttemptAt / workSlot hold the count.

const toMs = (iso) => (iso ? new Date(iso).getTime() : NaN);

// A custom company typed in by hand with no domain has nothing to derive a slug from (detect:ats
// skips it too): it is recorded as no_source without any request.
export const hasNoDomain = (company) => Boolean(company.isCustom && !company.domain);

function attemptsInThisSlot(meta, nowMs) {
  const slot = mostRecentSlot(nowMs);
  return toMs(meta?.workSlot) === slot ? meta.workAttempts ?? 0 : 0;
}

/** Is a failed company allowed another try now? { ok, reason?, nextAttemptAt? } */
export function retryAllowed(meta, nowMs) {
  const attempts = attemptsInThisSlot(meta, nowMs);
  if (attempts === 0) return { ok: true };
  if (attempts >= MAX_ATTEMPTS_PER_SLOT) return { ok: false, reason: "daily-cap" };
  const next = toMs(meta.workLastAttemptAt) + RETRY_DELAYS_MS[attempts - 1];
  if (nowMs < next) return { ok: false, reason: "backoff", nextAttemptAt: new Date(next).toISOString() };
  return { ok: true };
}

/** What one company needs: "detect" | "scrape" | null (plus why not, when it is waiting). */
export function companyNeeds(company, meta, nowMs) {
  const hasMeta = Boolean(meta?.scrapeStatus);
  let needs = null;
  if (!hasMeta) needs = "detect";
  else if (meta.scrapeStatus === "error") needs = "detect";
  else if (meta.scrapeStatus === "ok" && meta.scrapePending) needs = "scrape";
  if (!needs) return { needs: null };
  // A brand new company has never failed, so there is nothing to back off from.
  const allowed = retryAllowed(meta, nowMs);
  return allowed.ok ? { needs } : { needs: null, waiting: allowed };
}

/**
 * The watchlist companies that need work right now: { detect: Company[], scrape: Company[] }.
 * `scrape` holds the ones already detected; detection that succeeds adds to it during the run.
 * New companies = watchlist items with no companyMeta entry (a removed and re-added company has a
 * new id, so it starts from nothing).
 */
export function companiesNeedingWork(watchlist, companyMeta, nowMs) {
  const detect = [];
  const scrape = [];
  for (const company of watchlist ?? []) {
    const { needs } = companyNeeds(company, companyMeta?.[company.id], nowMs);
    if (needs === "detect") detect.push(company);
    else if (needs === "scrape") scrape.push(company);
  }
  return { detect, scrape };
}

/** The companyMeta fields that count an attempt that is starting now. */
export function startAttempt(meta, nowMs) {
  return {
    workAttempts: attemptsInThisSlot(meta, nowMs) + 1,
    workLastAttemptAt: new Date(nowMs).toISOString(),
    workSlot: new Date(mostRecentSlot(nowMs)).toISOString(),
  };
}

/** The fields that clear the failure count after a stage worked. */
export const clearAttempts = { workAttempts: 0, workLastAttemptAt: null };

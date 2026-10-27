import { mostRecentSlot } from "./dueTime.js";
import { retryAllowed } from "./newCompanies.js";

// The Others start (the Role page's Continue): scrape the Others boards if they were not scraped
// since the most recent 9:00 AM Pacific, then score the Others jobs that pass the prefilter. Plain
// functions of the stored record, like newCompanies.js. Nothing is queued: "waiting" is derived from
// scheduler.json -> othersWork, so a click made while the run lock was busy is picked up by a tick.
//
// othersWork: { requestedAt, servedRequestedAt, workAttempts, workLastAttemptAt, workSlot }
//   requestedAt         stamped by every Continue click (server clock)
//   servedRequestedAt   the requestedAt the last finished run answered; equal = nothing waiting
//   work*               the failure backoff, the same fields and rule as newCompanies.js
// A click made during a run has a newer requestedAt, so it is still waiting when that run ends.

/** Is there a Continue click no finished run has answered yet? */
export function othersPending(record) {
  return Boolean(record?.requestedAt) && record.requestedAt !== record.servedRequestedAt;
}

/** Has the Others/watchlist scrape already happened since the most recent 9:00 AM Pacific? */
export function scrapeIsFresh(lastScrapeAt, nowMs) {
  const t = lastScrapeAt ? new Date(lastScrapeAt).getTime() : NaN;
  return !Number.isNaN(t) && t >= mostRecentSlot(nowMs);
}

/** { ok } or { ok: false, reason: "nothing" | "backoff" | "daily-cap", nextAttemptAt? } */
export function othersMayRun(record, nowMs) {
  if (!othersPending(record)) return { ok: false, reason: "nothing" };
  return retryAllowed(record, nowMs);
}

// When a scheduled run is due. Pure functions (no clock, no files), so tests drive them with a fake
// `nowMs`. The one rule: a run is due when there has been no successful scrape since the most
// recent 9:00 AM America/Los_Angeles, and the day's scoring is not done yet.

export const SCHEDULE_TIME_ZONE = "America/Los_Angeles";
export const SCHEDULE_HOUR = 9;

// Failure backoff. Every attempt is counted when it STARTS (so a crash mid-run also counts), per
// 9 AM slot. After a failed attempt the next one waits 30 min, then 2 h, and a slot gets at most 3
// attempts: a dead network or an exhausted API balance costs three tries a day, not one per tick.
// The next 9 AM starts a fresh slot with a fresh count. A run that finishes (even with jobs left
// by the 150-call ceiling or rejected answers) ends the day's work: those are retried tomorrow.
export const RETRY_DELAYS_MS = [30 * 60 * 1000, 2 * 60 * 60 * 1000];
export const MAX_ATTEMPTS_PER_SLOT = RETRY_DELAYS_MS.length + 1;

// Milliseconds the zone is ahead of UTC at instant `ms` (negative for Los Angeles).
function zoneOffsetMs(ms, timeZone) {
  const whole = ms - (ms % 1000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(new Date(whole))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - whole;
}

// The instant at which the wall clock in `timeZone` reads y-m-d h:00. Two passes so a date on the
// other side of a DST change from the first guess still lands right (9 AM never falls in the gap).
function zonedWallTimeToMs(y, m, d, hour, timeZone) {
  const guess = Date.UTC(y, m - 1, d, hour);
  const first = guess - zoneOffsetMs(guess, timeZone);
  return guess - zoneOffsetMs(first, timeZone);
}

function zonedDate(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(new Date(ms))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)])
  );
  return { y: parts.year, m: parts.month, d: parts.day };
}

/** The latest 9:00 AM Pacific at or before `nowMs`, in epoch milliseconds. */
export function mostRecentSlot(nowMs, { timeZone = SCHEDULE_TIME_ZONE, hour = SCHEDULE_HOUR } = {}) {
  const { y, m, d } = zonedDate(nowMs, timeZone);
  const today = zonedWallTimeToMs(y, m, d, hour, timeZone);
  if (today <= nowMs) return today;
  // Before 9 AM: yesterday's. 24 h before today's slot is 8 to 10 AM yesterday on a DST day, still
  // yesterday's date.
  const prev = zonedDate(today - 24 * 60 * 60 * 1000, timeZone);
  return zonedWallTimeToMs(prev.y, prev.m, prev.d, hour, timeZone);
}

const toMs = (iso) => (iso ? new Date(iso).getTime() : NaN);

/**
 * Decides what to do right now. Inputs:
 *   nowMs        the clock
 *   lastScrapeAt ISO time of the last successful scrape (store meta; a manual fetch:jobs counts)
 *   slot         the scheduler's record { start, attempts, lastAttemptAt, scoringDone } or null
 * Returns { action: "run" | "wait", reason, slotStart (ms), needsScrape, needsScoring, nextAttemptAt? }.
 * reason: "first-run" | "due" | "scoring-only" | "up-to-date" | "daily-cap" | "backoff".
 */
export function decideRun({ nowMs, lastScrapeAt, slot }) {
  const slotStart = mostRecentSlot(nowMs);
  const record = slot && toMs(slot.start) === slotStart ? slot : { attempts: 0, lastAttemptAt: null, scoringDone: false };

  const lastScrapeMs = toMs(lastScrapeAt);
  const needsScrape = Number.isNaN(lastScrapeMs) || lastScrapeMs < slotStart;
  const needsScoring = !record.scoringDone;
  const base = { slotStart, needsScrape, needsScoring };

  if (!needsScrape && !needsScoring) return { ...base, action: "wait", reason: "up-to-date" };
  if (record.attempts >= MAX_ATTEMPTS_PER_SLOT) return { ...base, action: "wait", reason: "daily-cap" };
  if (record.attempts > 0) {
    const nextAttemptMs = toMs(record.lastAttemptAt) + RETRY_DELAYS_MS[record.attempts - 1];
    if (nowMs < nextAttemptMs) {
      return { ...base, action: "wait", reason: "backoff", nextAttemptAt: new Date(nextAttemptMs).toISOString() };
    }
  }
  const reason = Number.isNaN(lastScrapeMs) ? "first-run" : needsScrape ? "due" : "scoring-only";
  return { ...base, action: "run", reason };
}

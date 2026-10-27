// Run with: node --test server/scheduler/dueTime.test.js
// Pure functions with a fake clock: no files, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mostRecentSlot, decideRun, RETRY_DELAYS_MS, MAX_ATTEMPTS_PER_SLOT } from "./dueTime.js";

const at = (isoString) => new Date(isoString).getTime();
const slotIso = (nowIso) => new Date(mostRecentSlot(at(nowIso))).toISOString();

test("the most recent slot is today's 9 AM Pacific once it has passed, yesterday's before", () => {
  assert.equal(slotIso("2026-10-21T15:59:00Z"), "2026-10-20T16:00:00.000Z"); // 8:59 PDT
  assert.equal(slotIso("2026-10-21T16:00:00Z"), "2026-10-21T16:00:00.000Z"); // exactly 9:00 PDT
  assert.equal(slotIso("2026-10-21T23:30:00Z"), "2026-10-21T16:00:00.000Z");
  assert.equal(slotIso("2026-10-22T03:00:00Z"), "2026-10-21T16:00:00.000Z"); // still the 21st in Pacific
});

test("the slot follows daylight saving: spring forward (2026-03-08) and fall back (2026-11-01)", () => {
  // Before the change 9 AM is 17:00 UTC (PST); after it 16:00 UTC (PDT).
  assert.equal(slotIso("2026-03-08T15:59:00Z"), "2026-03-07T17:00:00.000Z");
  assert.equal(slotIso("2026-03-08T16:00:00Z"), "2026-03-08T16:00:00.000Z");
  assert.equal(slotIso("2026-03-09T15:59:00Z"), "2026-03-08T16:00:00.000Z");
  assert.equal(slotIso("2026-11-01T16:59:00Z"), "2026-10-31T16:00:00.000Z");
  assert.equal(slotIso("2026-11-01T17:00:00Z"), "2026-11-01T17:00:00.000Z");
  assert.equal(slotIso("2026-11-02T16:59:00Z"), "2026-11-01T17:00:00.000Z");
});

test("first ever run: nothing scraped yet is due at any time of day", () => {
  const d = decideRun({ nowMs: at("2026-10-21T10:00:00Z"), lastScrapeAt: null, slot: null });
  assert.equal(d.action, "run");
  assert.equal(d.reason, "first-run");
  assert.equal(d.needsScrape, true);
});

test("a scrape before the latest 9 AM is due; one after it is not", () => {
  const nowMs = at("2026-10-21T20:00:00Z");
  assert.equal(decideRun({ nowMs, lastScrapeAt: "2026-10-21T15:59:00Z", slot: null }).reason, "due");
  const after = decideRun({ nowMs, lastScrapeAt: "2026-10-21T16:01:00Z", slot: { start: "2026-10-21T16:00:00.000Z", attempts: 1, lastAttemptAt: "2026-10-21T16:01:00Z", scoringDone: true } });
  assert.equal(after.action, "wait");
  assert.equal(after.reason, "up-to-date");
});

test("before 9 AM nothing new is due when yesterday's run happened after yesterday's 9 AM", () => {
  const d = decideRun({
    nowMs: at("2026-10-21T14:00:00Z"), // 7 AM Pacific
    lastScrapeAt: "2026-10-20T18:00:00Z",
    slot: { start: "2026-10-20T16:00:00.000Z", attempts: 1, lastAttemptAt: "2026-10-20T18:00:00Z", scoringDone: true },
  });
  assert.equal(d.reason, "up-to-date");
});

test("a laptop that slept through 9 AM (and several days) gets one catch-up run", () => {
  const d = decideRun({ nowMs: at("2026-10-25T22:00:00Z"), lastScrapeAt: "2026-10-21T17:00:00Z", slot: { start: "2026-10-21T16:00:00.000Z", attempts: 1, lastAttemptAt: "2026-10-21T17:00:00Z", scoringDone: true } });
  assert.equal(d.action, "run");
  assert.equal(d.reason, "due");
  assert.equal(new Date(d.slotStart).toISOString(), "2026-10-25T16:00:00.000Z");
});

test("scrape done but scoring not: the next run is scoring only", () => {
  const slot = { start: "2026-10-21T16:00:00.000Z", attempts: 1, lastAttemptAt: "2026-10-21T16:05:00Z", scoringDone: false };
  const early = decideRun({ nowMs: at("2026-10-21T16:20:00Z"), lastScrapeAt: "2026-10-21T16:04:00Z", slot });
  assert.equal(early.reason, "backoff");
  const later = decideRun({ nowMs: at("2026-10-21T16:35:00Z"), lastScrapeAt: "2026-10-21T16:04:00Z", slot });
  assert.equal(later.action, "run");
  assert.equal(later.reason, "scoring-only");
  assert.equal(later.needsScrape, false);
});

test("failure backoff: 30 minutes, then 2 hours, then the daily cap, then a fresh slot", () => {
  const start = "2026-10-21T16:00:00.000Z";
  const attemptAt = at("2026-10-21T16:05:00Z");
  const decide = (attempts, nowMs, slotStartIso = start) =>
    decideRun({ nowMs, lastScrapeAt: null, slot: { start: slotStartIso, attempts, lastAttemptAt: new Date(attemptAt).toISOString(), scoringDone: false } });

  assert.equal(decide(1, attemptAt + RETRY_DELAYS_MS[0] - 1).reason, "backoff");
  assert.equal(decide(1, attemptAt + RETRY_DELAYS_MS[0]).action, "run");
  assert.equal(decide(2, attemptAt + RETRY_DELAYS_MS[1] - 1).reason, "backoff");
  assert.equal(decide(2, attemptAt + RETRY_DELAYS_MS[1]).action, "run");
  assert.equal(MAX_ATTEMPTS_PER_SLOT, 3);
  assert.equal(decide(3, attemptAt + 20 * 60 * 60 * 1000).reason, "daily-cap");
  // The next 9 AM slot starts from zero attempts.
  const nextDay = decide(3, at("2026-10-22T16:00:00Z"));
  assert.equal(nextDay.action, "run");
});

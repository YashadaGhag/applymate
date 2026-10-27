// Run with: node --test server/scheduler/scheduler.test.js
// No network and no model calls: scrape and scoring are fakes, the data folder is a temp one.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-scheduler-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));

const { runTick, getUpdateStatus, resetSchedulerForTests } = await import("./scheduler.js");
const { getState, updateState, getSchedulerStore } = await import("../store/store.js");
const { acquireRunLock } = await import("../store/runLock.js");
const { default: updateStatusRouter } = await import("../routes/updateStatus.js");

// 10 AM Pacific on 2026-10-21; today's slot is 16:00Z.
const T0 = Date.parse("2026-10-21T17:00:00Z");
const MIN = 60 * 1000;
let clock;
const quiet = { log() {}, warn() {}, now: () => clock };

function seed({ onboarded = true, resume = true, watchlist = true, lastScrapeAt = null } = {}) {
  writeData("store.json", {
    schemaVersion: 1,
    watchlist: watchlist ? [{ id: "c1", name: "Acme", domain: "acme.test" }] : [],
    companyMeta: {},
    profile: { resumeVersion: "v1", relocation: onboarded ? false : null },
    userState: { savedJobIds: [], dismissedJobIds: [], lastViewed: { watchlist: null } },
    meta: { lastScrapeAt },
  });
  writeData("resumes.json", { schemaVersion: 1, currentVersion: "v1", versions: { v1: resume ? { text: "resume text" } : {} }, replacement: null });
  fs.rmSync(path.join(dataDir, "scheduler.json"), { force: true });
}

// A scrape that "succeeds" the way the real one does: lastScrapeAt is written when it finishes.
function fakes({ scrape = "ok", score = "ok" } = {}) {
  const calls = { scrape: 0, score: 0, phases: [] };
  return {
    calls,
    deps: {
      ...quiet,
      async runScrape() {
        calls.scrape += 1;
        calls.phases.push(getUpdateStatus().phase);
        if (scrape === "throw") throw new Error("disk full");
        if (scrape === "fail") return { report: [], okSources: 0, errorSources: 3, failed: true };
        updateState((s) => ({ ...s, meta: { ...s.meta, lastScrapeAt: new Date(clock).toISOString() } }));
        return { report: [], okSources: 2, errorSources: 1, failed: false };
      },
      async scoreJobs({ onCall, abortOnApiError }) {
        calls.score += 1;
        calls.phases.push(getUpdateStatus().phase);
        assert.equal(abortOnApiError, true);
        if (score === "throw") throw new Error("boom");
        onCall();
        onCall();
        if (score === "abort") {
          return { status: "ok", scored: [{ id: "a", score: 80 }], failed: [{ kind: "api-error" }], aborted: "credit balance too low", leftByCeiling: 0 };
        }
        return { status: "ok", scored: [{ id: "a", score: 80 }, { id: "b", score: 40 }, { id: "c", score: 55 }], failed: [], leftByCeiling: 0 };
      },
    },
  };
}

beforeEach(() => {
  clock = T0;
  resetSchedulerForTests();
  seed();
});

test("an empty watchlist no longer skips: the daily run scrapes and scores Others for a finished setup", async () => {
  seed({ watchlist: false });
  const { calls, deps } = fakes();
  const result = await runTick(deps);
  assert.equal(result.ran, true);
  assert.equal(result.outcome, "done");
  assert.deepEqual([calls.scrape, calls.score], [1, 1]);
});

test("skips, without scraping, when onboarding is incomplete or there is no resume", async () => {
  for (const [opts, why] of [
    [{ onboarded: false }, "onboarding is not complete"],
    [{ resume: false }, "no active resume"],
  ]) {
    resetSchedulerForTests();
    seed(opts);
    const { calls, deps } = fakes();
    const result = await runTick(deps);
    assert.equal(result.ran, false);
    assert.equal(result.skipped, why);
    assert.deepEqual([calls.scrape, calls.score], [0, 0]);
    assert.equal(getSchedulerStore().slot, null);
  }
});

test("skips, and counts no attempt, while another run holds the lock", async () => {
  const lock = acquireRunLock("replace-resume");
  assert.equal(lock.ok, true);
  try {
    const { calls, deps } = fakes();
    const result = await runTick(deps);
    assert.equal(result.skipped, "locked");
    assert.deepEqual([calls.scrape, calls.score], [0, 0]);
    assert.equal(getSchedulerStore().slot, null);
  } finally {
    lock.release();
  }
  // With the lock free, the next tick runs.
  const { deps } = fakes();
  assert.equal((await runTick(deps)).ran, true);
});

test("a due run scrapes then scores, reports newly visible jobs, and is not due again that day", async () => {
  const { calls, deps } = fakes();
  const result = await runTick(deps);
  assert.equal(result.outcome, "done");
  assert.deepEqual(calls.phases, ["scraping", "scoring"]); // "running" with the right phase mid-run
  assert.equal(result.calls, 2);
  assert.equal(result.scored, 3);
  assert.equal(result.newJobs, 2); // 80 and 55 are shown; 40 is hidden

  const status = getUpdateStatus();
  assert.equal(status.state, "idle");
  assert.equal(status.outcome, "done");
  assert.equal(status.newJobs, 2);
  assert.ok(status.startedAt && status.finishedAt);

  clock += 15 * MIN;
  const again = await runTick(deps);
  assert.equal(again.skipped, "up-to-date");
  assert.equal(calls.scrape, 1);
  // The lock is released afterwards.
  const lock = acquireRunLock("scrape");
  assert.equal(lock.ok, true);
  lock.release();
});

test("scrape succeeded but scoring stopped on an API error: the retry pays for scoring only", async () => {
  const first = fakes({ score: "abort" });
  const failed = await runTick(first.deps);
  assert.equal(failed.outcome, "failed");
  assert.equal(failed.failedPhase, "scoring");
  assert.equal(getUpdateStatus().state, "failed");
  assert.match(getUpdateStatus().message, /credit balance/);

  clock += 15 * MIN; // inside the 30-minute backoff
  assert.equal((await runTick(first.deps)).skipped, "backoff");
  assert.equal(first.calls.score, 1);

  clock += 20 * MIN; // 35 minutes after the attempt
  const second = fakes();
  const retry = await runTick(second.deps);
  assert.equal(retry.outcome, "done");
  assert.equal(second.calls.scrape, 0, "the scrape is not repeated");
  assert.equal(second.calls.score, 1);
  assert.equal(getUpdateStatus().state, "idle");
});

test("a failed scrape does not score, backs off, stops after three attempts and starts over the next 9 AM", async () => {
  const { calls, deps } = fakes({ scrape: "fail" });
  const first = await runTick(deps);
  assert.equal(first.failedPhase, "scraping");
  assert.equal(calls.score, 0);
  assert.equal(getUpdateStatus().failedPhase, "scraping");

  clock += 29 * MIN;
  assert.equal((await runTick(deps)).skipped, "backoff");
  clock += 2 * MIN; // 31 minutes
  assert.equal((await runTick(deps)).ran, true);
  clock += 119 * MIN;
  assert.equal((await runTick(deps)).skipped, "backoff");
  clock += 2 * MIN; // 2 h 1 min after the second attempt
  assert.equal((await runTick(deps)).ran, true);
  assert.equal(calls.scrape, 3);

  clock += 3 * 60 * MIN;
  assert.equal((await runTick(deps)).skipped, "daily-cap");
  assert.equal(calls.scrape, 3);

  clock = Date.parse("2026-10-22T16:30:00Z"); // the next day, past 9 AM
  const ok = fakes();
  assert.equal((await runTick(ok.deps)).outcome, "done");
});

test("an exception in the scrape or in scoring is a failed run, never a crash", async () => {
  const a = await runTick(fakes({ scrape: "throw" }).deps);
  assert.equal(a.outcome, "failed");
  assert.equal(a.failedPhase, "scraping");
  assert.equal(getUpdateStatus().message, "disk full");

  resetSchedulerForTests();
  seed();
  const b = await runTick(fakes({ score: "throw" }).deps);
  assert.equal(b.failedPhase, "scoring");
});

test("a manual fetch:jobs that already scraped today leaves only scoring to do", async () => {
  seed({ lastScrapeAt: new Date(T0 - 5 * MIN).toISOString() });
  const { calls, deps } = fakes();
  assert.equal((await runTick(deps)).outcome, "done");
  assert.deepEqual([calls.scrape, calls.score], [0, 1]);
});

test("GET /api/jobs/update-status: shape, before any run, after a failure, and for an interrupted run", async () => {
  const app = express();
  app.use("/api", updateStatusRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const get = async () => (await fetch(`http://127.0.0.1:${server.address().port}/api/jobs/update-status`)).json();
  const keys = ["failedPhase", "finishedAt", "message", "newJobs", "outcome", "phase", "startedAt", "state"];
  try {
    const idle = await get();
    assert.deepEqual(Object.keys(idle).sort(), keys);
    assert.deepEqual(
      { state: idle.state, phase: idle.phase, startedAt: idle.startedAt, finishedAt: idle.finishedAt, outcome: idle.outcome },
      { state: "idle", phase: null, startedAt: null, finishedAt: null, outcome: null }
    );

    await runTick(fakes({ scrape: "fail" }).deps);
    const failed = await get();
    assert.equal(failed.state, "failed");
    assert.equal(failed.outcome, "failed");
    assert.equal(failed.phase, null);

    // A run record that never finished is a dead process's.
    fs.writeFileSync(
      path.join(dataDir, "scheduler.json"),
      JSON.stringify({ schemaVersion: 1, slot: null, lastRun: { startedAt: "2026-10-21T16:00:00.000Z", finishedAt: null, outcome: null } })
    );
    const interrupted = await get();
    assert.equal(interrupted.state, "failed");
    assert.equal(interrupted.phase, null);
    assert.equal(getState().meta.lastScrapeAt, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

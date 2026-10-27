// Run with: node --test server/scheduler/othersStart.test.js
// The Others start (the Role page's Continue): empty watchlist allowed, fresh scrape skipped, lock
// busy leaves it waiting, the chained check after a run (and that it cannot loop), profile saves
// not triggering it, the route and the status shape. Scrape, scoring and the Others job list are
// fakes: no network, no model calls, a temp data folder.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-othersstart-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));

const { othersPending, scrapeIsFresh, othersMayRun } = await import("./othersWork.js");
const { requestOthersWork, triggerOthersWork, triggerCompanyWork, runTick, getUpdateStatus, resetSchedulerForTests } = await import("./scheduler.js");
const { getState, updateState, getSchedulerStore } = await import("../store/store.js");
const { acquireRunLock } = await import("../store/runLock.js");
const { setOthersStartHandler, setWatchlistSavedHandler } = await import("./trigger.js");
const { default: othersStartRouter } = await import("../routes/othersStart.js");
const { default: stateRouter } = await import("../routes/state.js");

// 10 AM Pacific on 2026-10-21; today's 9 AM slot is 16:00Z.
const T0 = Date.parse("2026-10-21T17:00:00Z");
const MIN = 60 * 1000;
let clock;

const company = (id) => ({ id, name: `Co ${id}`, domain: `${id}.test`, isCustom: false, addedAt: "2026-10-01T00:00:00Z" });

function seed({ watchlist = [], onboarded = true, lastScrapeAt = null } = {}) {
  writeData("store.json", {
    schemaVersion: 1,
    watchlist,
    companyMeta: {},
    profile: { resumeVersion: "v1", relocation: onboarded ? false : null },
    userState: { savedJobIds: [], dismissedJobIds: [], lastViewed: { watchlist: null } },
    meta: { lastScrapeAt },
  });
  writeData("jobs.json", { schemaVersion: 1, jobs: [] });
  writeData("resumes.json", { schemaVersion: 1, currentVersion: "v1", versions: { v1: { text: "resume" } }, replacement: null });
  fs.rmSync(path.join(dataDir, "scheduler.json"), { force: true });
}

function fakes({ scrape = "ok", score = "ok", onScore = null } = {}) {
  const calls = { scrape: 0, score: [], phases: [] };
  const deps = {
    othersWork: true,
    companyWork: false,
    log() {},
    warn() {},
    now: () => clock,
    othersJobIds: () => ["others:a:1", "others:b:2"],
    async runScrape() {
      calls.scrape += 1;
      calls.phases.push(getUpdateStatus().phase);
      if (scrape === "fail") return { report: [], okSources: 0, errorSources: 2, failed: true };
      updateState((s) => ({ ...s, meta: { ...s.meta, lastScrapeAt: new Date(clock).toISOString() } }));
      return { report: [], okSources: 2, errorSources: 0, failed: false };
    },
    async scoreJobs(opts) {
      calls.score.push(opts);
      calls.phases.push(getUpdateStatus().phase);
      assert.equal(opts.abortOnApiError, true);
      if (onScore) await onScore();
      if (score === "abort") return { status: "ok", scored: [], failed: [{ kind: "api-error" }], aborted: "credit balance too low" };
      opts.onCall();
      return { status: "ok", scored: [{ id: "others:a:1", score: 80 }, { id: "others:b:2", score: 30 }], failed: [] };
    },
  };
  return { calls, deps };
}

// Adds fake detection and a targeted scrape, so new-company work can run too.
function withCompanyFakes(deps, counter) {
  return {
    ...deps,
    companyWork: true,
    sleep: async () => {},
    async detectCompany() {
      counter.detect += 1;
      return { atsPlatform: "greenhouse", atsSlug: "n1", scrapeStatus: "ok", atsHint: null };
    },
    storeDetection(id, detection) {
      updateState((s) => ({ ...s, companyMeta: { ...s.companyMeta, [id]: detection } }));
    },
    async runScrape(opts) {
      if (!opts) return deps.runScrape();
      return { report: [], okSources: 1, errorSources: 0, failed: false, okCompanyIds: opts.companyIds, errorCompanyIds: [] };
    },
  };
}

beforeEach(() => {
  clock = T0;
  resetSchedulerForTests();
  setOthersStartHandler(null);
  setWatchlistSavedHandler(null);
  seed();
});

// ─── The pure rules ─────────────────────────────────────────────────────────────────────────────

test("a click is waiting until a finished run answers it; a fresh scrape is one since 9 AM Pacific", () => {
  assert.equal(othersPending(null), false);
  assert.equal(othersPending({ requestedAt: "a" }), true);
  assert.equal(othersPending({ requestedAt: "a", servedRequestedAt: "a" }), false);
  assert.equal(othersPending({ requestedAt: "b", servedRequestedAt: "a" }), true, "a newer click stays waiting");
  assert.equal(scrapeIsFresh(null, T0), false);
  assert.equal(scrapeIsFresh("2026-10-21T15:59:00Z", T0), false);
  assert.equal(scrapeIsFresh("2026-10-21T16:01:00Z", T0), true);
  assert.equal(othersMayRun({}, T0).reason, "nothing");
  assert.equal(othersMayRun({ requestedAt: "a" }, T0).ok, true);
});

// ─── The work ───────────────────────────────────────────────────────────────────────────────────

test("an empty watchlist is allowed: scrape, then score only the Others jobs, reported as running", async () => {
  const { calls, deps } = fakes();
  const answer = requestOthersWork(deps);
  assert.deepEqual(answer, { accepted: true });
  await answer.settled;

  assert.equal(calls.scrape, 1);
  assert.deepEqual(calls.score[0].onlyIds, ["others:a:1", "others:b:2"]);
  assert.deepEqual(calls.phases, ["scraping", "scoring"], "the status reads running, scraping then scoring");
  assert.ok(getState().meta.lastScrapeAt, "the ordinary scrape wrote lastScrapeAt");

  const rec = getSchedulerStore();
  assert.equal(rec.othersWork.servedRequestedAt, rec.othersWork.requestedAt);
  assert.equal(rec.othersWork.workAttempts, 0);
  assert.equal(rec.slot, null, "the daily slot record is not touched");
  assert.equal(rec.lastRun.kind, "others");
  assert.equal(rec.lastRun.outcome, "done");
  assert.equal(rec.lastRun.newJobs, 1);
  const status = getUpdateStatus();
  assert.deepEqual(Object.keys(status).sort(), ["failedPhase", "finishedAt", "message", "newJobs", "outcome", "phase", "startedAt", "state"]);
  assert.equal(status.state, "idle");
});

test("a fresh scrape is skipped, and repeated clicks cost no second scrape", async () => {
  seed({ lastScrapeAt: new Date(T0 - 5 * MIN).toISOString() });
  const { calls, deps } = fakes();
  await requestOthersWork(deps).settled;
  assert.equal(calls.scrape, 0);
  assert.equal(calls.score.length, 1, "scoring still runs (the cache decides what costs a call)");

  clock += 10 * MIN;
  await requestOthersWork(deps).settled; // Edit on the Selected Role card, then Continue again
  assert.equal(calls.scrape, 0);
  assert.equal(calls.score.length, 2);

  // After the scrape ran once today, a later click does not scrape again either.
  seed();
  const second = fakes();
  await requestOthersWork(second.deps).settled;
  clock += 10 * MIN;
  await requestOthersWork(second.deps).settled;
  assert.equal(second.calls.scrape, 1);
});

test("setup not finished: nothing is recorded or started", () => {
  seed({ onboarded: false });
  const { calls, deps } = fakes();
  const answer = requestOthersWork(deps);
  assert.deepEqual(answer, { accepted: false, reason: "onboarding is not complete" });
  assert.equal(getSchedulerStore().othersWork, null);
  assert.equal(calls.scrape, 0);
});

test("lock busy: no overlap, no attempt counted, and the next tick runs it", async () => {
  const lock = acquireRunLock("scrape");
  assert.equal(lock.ok, true);
  const { calls, deps } = fakes();
  try {
    const answer = requestOthersWork(deps);
    assert.equal(answer.accepted, true);
    const result = await answer.settled;
    assert.equal(result.skipped, "locked");
    assert.equal(calls.scrape + calls.score.length, 0);
    assert.equal(getSchedulerStore().othersWork.workAttempts ?? 0, 0);
    assert.equal(othersPending(getSchedulerStore().othersWork), true);
  } finally {
    lock.release();
  }
  clock += 15 * MIN;
  const tick = await runTick(deps);
  assert.equal(tick.others.outcome, "done");
  assert.equal(othersPending(getSchedulerStore().othersWork), false);
});

test("a failure backs off 30 minutes, then 2 hours, then stops for the day", async () => {
  const { calls, deps } = fakes({ score: "abort" });
  const first = await requestOthersWork(deps).settled;
  assert.equal(first.outcome, "failed");
  assert.equal(first.failedPhase, "scoring");
  assert.equal(getUpdateStatus().state, "failed");

  clock += 15 * MIN;
  assert.equal((await triggerOthersWork(deps)).skipped, "backoff", "a repeated click inside the backoff is refused, no hammering");
  clock += 16 * MIN;
  assert.equal((await triggerOthersWork(deps)).outcome, "failed");
  clock += 121 * MIN;
  assert.equal((await triggerOthersWork(deps)).outcome, "failed");
  assert.equal(calls.score.length, 3);
  clock += 5 * 60 * MIN;
  assert.equal((await triggerOthersWork(deps)).skipped, "daily-cap");
  assert.equal(calls.score.length, 3);
});

test("a failed scrape does not score", async () => {
  const { calls, deps } = fakes({ scrape: "fail" });
  const result = await requestOthersWork(deps).settled;
  assert.equal(result.failedPhase, "scraping");
  assert.equal(calls.score.length, 0);
  assert.equal(getState().meta.lastScrapeAt, null);
});

// ─── The chained check ──────────────────────────────────────────────────────────────────────────

test("when a run ends, a Continue clicked during it is picked up at once, not at the next tick", async () => {
  seed({ watchlist: [company("w1")] });
  let duringResult = null;
  const { calls, deps } = fakes({
    onScore: async () => {
      if (calls.score.length === 1) {
        const during = requestOthersWork(deps);
        assert.equal(during.accepted, true);
        duringResult = await during.settled;
      }
    },
  });
  const result = await runTick(deps);
  assert.equal(result.outcome, "done");
  assert.equal(duringResult.skipped, "busy", "the click did not overlap the running check");
  // Daily scrape + scoring, then the chained pass: the scrape is fresh, scoring answers the click.
  assert.equal(calls.scrape, 1);
  assert.equal(calls.score.length, 2);
  assert.equal(othersPending(getSchedulerStore().othersWork), false);
});

test("the chained check cannot loop: it runs once, never chains itself and respects the backoff", async () => {
  seed({ watchlist: [company("w1")] });
  const { calls, deps } = fakes({
    score: "abort",
    onScore: async () => {
      if (calls.score.length === 1) await requestOthersWork(deps).settled; // a click during the daily run
    },
  });
  const result = await runTick(deps);
  assert.equal(result.failedPhase, "scoring");
  // Daily scoring aborted (1 call), the chained pass tried the Others start once (2) and failed.
  // It did not chain again, and the backoff now blocks every further attempt.
  assert.equal(calls.score.length, 2);
  assert.equal(getSchedulerStore().othersWork.workAttempts, 1);
  assert.equal((await triggerOthersWork(deps)).skipped, "backoff");
  assert.equal(calls.score.length, 2);
});

test("a watchlist saved while the Others start runs is worked on right after it", async () => {
  const counter = { detect: 0 };
  const { deps } = fakes({
    onScore: async () => {
      updateState((s) => ({ ...s, watchlist: [company("n1")] })); // PUT /api/watchlist landed mid-run
    },
  });
  await requestOthersWork(withCompanyFakes(deps, counter)).settled;
  assert.equal(counter.detect, 1, "the new company was detected without waiting for a tick");
});

test("a new-company run that ends also picks up a Continue that was left waiting", async () => {
  seed({ watchlist: [company("n1")] });
  const counter = { detect: 0 };
  const { calls, deps } = fakes();
  const lock = acquireRunLock("scrape"); // a Continue that found the lock busy
  try {
    await requestOthersWork(deps).settled;
  } finally {
    lock.release();
  }
  assert.equal(calls.score.length, 0);
  assert.equal(othersPending(getSchedulerStore().othersWork), true);

  const result = await triggerCompanyWork(withCompanyFakes(deps, counter));
  assert.equal(result.ran, true);
  assert.equal(calls.score.length, 2, "the new company scoring, then the waiting Others start in the chained check");
  assert.equal(othersPending(getSchedulerStore().othersWork), false);
});

// ─── The signal ─────────────────────────────────────────────────────────────────────────────────

test("POST /api/onboarding/start-others answers 202; a GET or a profile save never starts it", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", othersStartRouter);
  app.use("/api", stateRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = (p) => `http://127.0.0.1:${server.address().port}${p}`;
  try {
    // No handler (scheduler off, or a test): the route only answers.
    const off = await fetch(url("/api/onboarding/start-others"), { method: "POST" });
    assert.equal(off.status, 202);
    assert.equal((await off.json()).accepted, false);

    let started = 0;
    setOthersStartHandler(() => {
      started += 1;
      return { accepted: true };
    });

    // Reading state and saving the profile (the Role page write-through, Details edits) never start it.
    await fetch(url("/api/state"));
    const put = await fetch(url("/api/profile"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeVersion: "v1", relocation: false }),
    });
    assert.equal(put.status, 200);
    assert.equal(started, 0);

    const res = await fetch(url("/api/onboarding/start-others"), { method: "POST" });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: true });
    assert.equal(started, 1);
  } finally {
    setOthersStartHandler(null);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the chained check does not retry, the same second, a company whose scrape just failed", async () => {
  seed({ watchlist: [company("n1")] });
  const counter = { detect: 0 };
  let scrapes = 0;
  const { deps } = fakes();
  const failing = {
    ...withCompanyFakes(deps, counter),
    async runScrape(opts) {
      if (!opts) return deps.runScrape();
      scrapes += 1;
      return { report: [], okSources: 0, errorSources: 1, failed: true, okCompanyIds: [], errorCompanyIds: opts.companyIds };
    },
  };
  const result = await triggerCompanyWork(failing);
  assert.equal(result.failedPhase, "scraping");
  assert.equal(scrapes, 1, "left for a later tick");
  assert.equal(getState().companyMeta.n1.scrapePending, true);
});

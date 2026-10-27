// Run with: node --test server/scheduler/watchlistRetry.test.js
// The onboarding loader's server side: the watchlist progress read (GET /api/jobs/update-status?watchlist=1)
// and Try again (POST /api/watchlist/retry). Detection, scraping and scoring are fakes: no network,
// no model calls, a temp data folder.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-retry-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));

const { watchlistProgress } = await import("./watchlistProgress.js");
const { requestCompanyRetry, triggerCompanyWork, resetSchedulerForTests } = await import("./scheduler.js");
const { getState, updateJobsStore, getSchedulerStore } = await import("../store/store.js");
const { acquireRunLock } = await import("../store/runLock.js");
const { setCompanyRetryHandler } = await import("./trigger.js");
const { default: watchlistRetryRouter } = await import("../routes/watchlistRetry.js");
const { default: updateStatusRouter } = await import("../routes/updateStatus.js");

// 10 AM Pacific on 2026-10-21; today's 9 AM slot is 16:00Z.
const T0 = Date.parse("2026-10-21T17:00:00Z");
const MIN = 60 * 1000;
let clock;

const company = (id) => ({ id, name: `Co ${id}`, domain: `${id}.test`, isCustom: false, addedAt: "2026-10-01T00:00:00Z" });
const ok = { atsPlatform: "greenhouse", atsSlug: "x", scrapeStatus: "ok" };

function seed({ watchlist = [company("a"), company("b")], meta = {}, lastRun = null } = {}) {
  writeData("store.json", {
    schemaVersion: 1,
    watchlist,
    companyMeta: meta,
    profile: { resumeVersion: "v1", relocation: false },
    userState: { savedJobIds: [], dismissedJobIds: [], lastViewed: { watchlist: null } },
    meta: { lastScrapeAt: null },
  });
  writeData("jobs.json", { schemaVersion: 1, jobs: [] });
  writeData("resumes.json", { schemaVersion: 1, currentVersion: "v1", versions: { v1: { text: "resume" } }, replacement: null });
  writeData("scores.json", { schemaVersion: 1, scores: {}, failures: {} });
  fs.rmSync(path.join(dataDir, "scheduler.json"), { force: true });
  if (lastRun) writeData("scheduler.json", { schemaVersion: 1, slot: null, lastRun, othersWork: null });
}

function fakes({ scrapeFails = [], onScrape = null } = {}) {
  const calls = { scrape: [], score: [], detect: [] };
  return {
    calls,
    deps: {
      companyWork: true,
      othersWork: false,
      log() {},
      warn() {},
      now: () => clock,
      sleep: async () => {},
      async detectCompany(c) {
        calls.detect.push(c.id);
        return { atsPlatform: "greenhouse", atsSlug: c.id, scrapeStatus: "ok", atsHint: null };
      },
      async runScrape(opts) {
        calls.scrape.push(opts);
        if (onScrape) await onScrape();
        const okIds = opts.companyIds.filter((id) => !scrapeFails.includes(id));
        updateJobsStore((s) => ({ ...s, jobs: [...s.jobs, ...okIds.map((id) => ({ id: `${id}:j`, company: { id }, title: "Product Designer" }))] }));
        return { report: [], okSources: okIds.length, errorSources: scrapeFails.length, failed: okIds.length === 0, okCompanyIds: okIds, errorCompanyIds: opts.companyIds.filter((id) => scrapeFails.includes(id)) };
      },
      async scoreJobs(opts) {
        calls.score.push(opts);
        assert.equal(opts.abortOnApiError, true, "the same scoring rules as every run");
        assert.equal(opts.maxCalls, undefined, "no ceiling override: the default 150 applies");
        opts.onCall();
        return { status: "ok", scored: opts.onlyIds.map((id) => ({ id, score: 80 })), failed: [] };
      },
    },
  };
}

beforeEach(() => {
  clock = T0;
  resetSchedulerForTests();
  setCompanyRetryHandler(null);
  seed();
});

// ─── The progress read ──────────────────────────────────────────────────────────────────────────

test("progress: waiting, checked, not checked and no-source are told apart; no_source is never a failure", () => {
  const meta = {
    a: ok, // scraped
    b: { scrapeStatus: "error" }, // careers page could not be reached
    c: { ...ok, scrapePending: true }, // detected, first scrape not done yet
    d: { ...ok, scrapePending: true, workFailedAt: "2026-10-21T17:00:00Z" }, // its scrape failed
    e: { scrapeStatus: "no_source", noSourceAt: "2026-10-21T17:00:00Z" },
    // f: no entry yet
  };
  const watchlist = ["a", "b", "c", "d", "e", "f"].map(company);
  const p = watchlistProgress({ watchlist, companyMeta: meta, jobs: [], scores: {}, resumeVersion: "v1", enabled: true, lastRun: null });
  assert.equal(p.total, 6);
  assert.equal(p.scraped, 1);
  assert.equal(p.waiting, 2, "c and f");
  assert.deepEqual(p.notChecked.map((n) => n.id), ["b", "d"]);
  assert.ok(!p.notChecked.some((n) => n.id === "e"), "a company with no supported source is not in the list");
  assert.equal(p.enabled, true);
});

test("progress: roles are what the Watchlist tab would list (open, current resume, 50 or more)", () => {
  const job = (id, companyId, extra = {}) => ({ id, company: { id: companyId }, closed: false, ...extra });
  const jobs = [
    job("1", "a"),
    job("2", "a"),
    job("3", "b"),
    job("4", "a", { closed: true }),
    job("5", "a"), // below 50
    job("6", "a"), // an older resume
    job("7", "zzz"), // not on the watchlist
  ];
  const sc = (score, resumeVersion = "v1") => ({ score, resumeVersion });
  const scores = { 1: sc(80), 2: sc(55), 3: sc(60), 4: sc(90), 5: sc(30), 6: sc(90, "old"), 7: sc(90) };
  const p = watchlistProgress({ watchlist: [company("a"), company("b")], companyMeta: {}, jobs, scores, resumeVersion: "v1", enabled: false, lastRun: null });
  assert.equal(p.rolesFound, 3);
  assert.equal(p.companiesWithRoles, 2);
  assert.equal(p.enabled, false);
});

test("progress: scoringFailed only for a failed new-company run that stopped in scoring", () => {
  const base = { watchlist: [], companyMeta: {}, jobs: [], scores: {}, resumeVersion: "v1", enabled: true };
  const run = (extra) => ({ kind: "new-companies", outcome: "failed", failedPhase: "scoring", ...extra });
  assert.equal(watchlistProgress({ ...base, lastRun: run() }).scoringFailed, true);
  assert.equal(watchlistProgress({ ...base, lastRun: run({ failedPhase: "scraping" }) }).scoringFailed, false);
  assert.equal(watchlistProgress({ ...base, lastRun: run({ kind: undefined }) }).scoringFailed, false, "a daily run's failure is not this one");
  assert.equal(watchlistProgress({ ...base, lastRun: null }).scoringFailed, false);
});

test("a scrape that failed is marked, named as not checked, and cleared by a later success", async () => {
  seed({ watchlist: [company("a"), company("b")] });
  const { deps } = fakes({ scrapeFails: ["b"] });
  const result = await triggerCompanyWork(deps);
  assert.equal(result.outcome, "done", "one company worked, so the run is not a failure");
  assert.ok(getState().companyMeta.b.workFailedAt);
  const state = getState();
  const p = watchlistProgress({ watchlist: state.watchlist, companyMeta: state.companyMeta, jobs: [], scores: {}, resumeVersion: "v1", enabled: true, lastRun: null });
  assert.deepEqual(p.notChecked.map((n) => n.id), ["b"]);
  assert.equal(p.waiting, 0);

  clock += 31 * MIN;
  await triggerCompanyWork(fakes().deps);
  assert.equal(getState().companyMeta.b.workFailedAt, null);
});

// ─── The routes ─────────────────────────────────────────────────────────────────────────────────

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use("/api", watchlistRetryRouter);
  app.use("/api", updateStatusRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = (p) => `http://127.0.0.1:${server.address().port}${p}`;
  try {
    await fn(url);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /api/jobs/update-status: the default shape is unchanged; ?watchlist=1 adds the watchlist block", async () => {
  await withServer(async (url) => {
    const plain = await (await fetch(url("/api/jobs/update-status"))).json();
    assert.deepEqual(Object.keys(plain).sort(), ["failedPhase", "finishedAt", "message", "newJobs", "outcome", "phase", "startedAt", "state"]);

    const withList = await (await fetch(url("/api/jobs/update-status?watchlist=1"))).json();
    assert.equal(withList.watchlist.total, 2);
    assert.equal(withList.watchlist.waiting, 2);
    assert.equal(withList.watchlist.enabled, false, "no scheduler in tests: the loader would not wait");
    assert.equal(withList.state, "idle");
  });
});

test("POST /api/watchlist/retry answers 202; with the scheduler off it starts nothing", async () => {
  await withServer(async (url) => {
    const off = await fetch(url("/api/watchlist/retry"), { method: "POST" });
    assert.equal(off.status, 202);
    assert.deepEqual(await off.json(), { accepted: false, reason: "the scheduler is off" });

    let started = 0;
    setCompanyRetryHandler(() => {
      started += 1;
      return { accepted: true, running: false };
    });
    const res = await fetch(url("/api/watchlist/retry"), { method: "POST" });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: true, running: false });
    assert.equal(started, 1);
    // A read of the status never retries.
    await fetch(url("/api/jobs/update-status?watchlist=1"));
    assert.equal(started, 1);
  });
});

// ─── Try again ──────────────────────────────────────────────────────────────────────────────────

test("retry clears the backoff of the failed companies and runs the same work now", async () => {
  const failedMeta = { ...ok, scrapePending: true, workFailedAt: new Date(T0).toISOString(), workAttempts: 1, workLastAttemptAt: new Date(T0).toISOString(), workSlot: "2026-10-21T16:00:00.000Z" };
  seed({ watchlist: [company("a"), company("b")], meta: { a: ok, b: failedMeta } });
  const { calls, deps } = fakes();

  // Inside the 30-minute backoff a tick would leave it alone.
  assert.equal((await triggerCompanyWork(deps)).skipped, "nothing");

  const answer = requestCompanyRetry(deps);
  assert.deepEqual(answer, { accepted: true, running: false });
  await answer.settled;
  assert.deepEqual(calls.scrape, [{ companyIds: ["b"] }], "only the failed company, scrape only");
  assert.deepEqual(calls.score.map((c) => c.onlyIds), [["b:j"]]);
  assert.equal(calls.score.length, 1, "one scoring call set, no retries inside the run");
  const meta = getState().companyMeta.b;
  assert.equal(meta.scrapePending, false);
  assert.equal(meta.workFailedAt, null);
});

test("repeated clicks: while a run is going the click only says running, and nothing is started twice", async () => {
  seed({ watchlist: [company("a")], meta: { a: { ...ok, scrapePending: true, workFailedAt: new Date(T0).toISOString() } } });
  let release;
  const { calls, deps } = fakes({ onScrape: () => new Promise((r) => { release = r; }) });
  const first = requestCompanyRetry(deps);
  assert.equal(first.running, false);
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(requestCompanyRetry(deps), { accepted: true, running: true });
  assert.deepEqual(requestCompanyRetry(deps), { accepted: true, running: true });
  assert.equal(calls.scrape.length, 1);

  release();
  await first.settled;
  assert.equal(calls.scrape.length, 1);
  assert.equal(calls.score.length, 1);
});

test("a held run lock means already running: nothing is cleared or started", async () => {
  const waitingMeta = { ...ok, scrapePending: true, workFailedAt: new Date(T0).toISOString(), workAttempts: 2, workLastAttemptAt: new Date(T0).toISOString(), workSlot: "2026-10-21T16:00:00.000Z" };
  seed({ watchlist: [company("a")], meta: { a: waitingMeta } });
  const lock = acquireRunLock("scrape");
  assert.equal(lock.ok, true);
  const { calls, deps } = fakes();
  try {
    assert.deepEqual(requestCompanyRetry(deps), { accepted: true, running: true });
    assert.equal(calls.scrape.length, 0);
    assert.equal(getState().companyMeta.a.workAttempts, 2, "the backoff is untouched");
  } finally {
    lock.release();
  }
});

test("after a scoring failure there is nothing to scrape: retry scores the watchlist jobs that have no score", async () => {
  const lastRun = { startedAt: new Date(T0).toISOString(), finishedAt: new Date(T0).toISOString(), outcome: "failed", failedPhase: "scoring", kind: "new-companies", scored: 0, calls: 1, newJobs: 0, message: "x" };
  seed({ watchlist: [company("a")], meta: { a: ok }, lastRun });
  updateJobsStore((s) => ({ ...s, jobs: [{ id: "a:j", company: { id: "a" }, title: "Product Designer" }] }));
  const { calls, deps } = fakes();
  const answer = requestCompanyRetry(deps);
  await answer.settled;
  assert.equal(calls.scrape.length, 0);
  assert.deepEqual(calls.score.map((c) => c.onlyIds), [["a:j"]]);
  assert.equal(getSchedulerStore().lastRun.outcome, "done");
});

test("with nothing failed and nothing waiting, retry starts no run", async () => {
  seed({ watchlist: [company("a")], meta: { a: ok } });
  const { calls, deps } = fakes();
  const answer = requestCompanyRetry(deps);
  assert.equal((await answer.settled).skipped, "nothing");
  assert.equal(calls.scrape.length + calls.score.length + calls.detect.length, 0);
});

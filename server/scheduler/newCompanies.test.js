// Run with: node --test server/scheduler/newCompanies.test.js
// New watchlist companies: what counts as new, the lock-busy wait, no_source recorded and not
// re-probed, only new companies scraped, failure backoff, and PUT /api/watchlist returning at once.
// Detection, scraping and scoring are fakes: no network, no model calls, a temp data folder.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-newcompanies-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));

const { companiesNeedingWork, companyNeeds, hasNoDomain } = await import("./newCompanies.js");
const { triggerCompanyWork, runTick, getUpdateStatus, resetSchedulerForTests } = await import("./scheduler.js");
const { getState, updateJobsStore, getSchedulerStore } = await import("../store/store.js");
const { acquireRunLock } = await import("../store/runLock.js");
const { setWatchlistSavedHandler, notifyWatchlistSaved } = await import("./trigger.js");
const { default: stateRouter } = await import("../routes/state.js");

// 10 AM Pacific on 2026-10-21; today's 9 AM slot is 16:00Z.
const T0 = Date.parse("2026-10-21T17:00:00Z");
const MIN = 60 * 1000;
let clock;

const company = (id, extra = {}) => ({ id, name: `Co ${id}`, domain: `${id}.test`, isCustom: false, addedAt: "2026-10-01T00:00:00Z", ...extra });
const okMeta = { atsPlatform: "greenhouse", atsSlug: "x", scrapeStatus: "ok" };

function seed({ watchlist = [company("c1"), company("c2"), company("c3")], meta = { c1: okMeta }, onboarded = true, resume = true } = {}) {
  writeData("store.json", {
    schemaVersion: 1,
    watchlist,
    companyMeta: meta,
    profile: { resumeVersion: "v1", relocation: onboarded ? false : null },
    userState: { savedJobIds: [], dismissedJobIds: [], lastViewed: { watchlist: null } },
    meta: { lastScrapeAt: new Date(T0 - 5 * MIN).toISOString() },
  });
  writeData("jobs.json", { schemaVersion: 1, jobs: [{ id: "c1:old", company: { id: "c1" }, title: "Product Designer" }] });
  writeData("resumes.json", { schemaVersion: 1, currentVersion: "v1", versions: { v1: resume ? { text: "resume" } : {} }, replacement: null });
  fs.rmSync(path.join(dataDir, "scheduler.json"), { force: true });
}

// Fakes that record what they were asked to do.
function fakes({ detect = {}, scrapeFails = [], score = "ok" } = {}) {
  const calls = { detect: [], scrape: [], score: [], phases: [] };
  return {
    calls,
    deps: {
      companyWork: true,
      log() {},
      warn() {},
      now: () => clock,
      sleep: async () => {},
      async detectCompany(c) {
        calls.detect.push(c.id);
        calls.phases.push(getUpdateStatus().phase);
        const outcome = detect[c.id] ?? "ok";
        if (outcome === "throw") throw new Error("offline");
        if (outcome === "ok") return { atsPlatform: "greenhouse", atsSlug: c.id, scrapeStatus: "ok", atsHint: null };
        return { atsPlatform: null, atsSlug: null, scrapeStatus: outcome, atsHint: null };
      },
      async runScrape(opts) {
        calls.scrape.push(opts);
        calls.phases.push(getUpdateStatus().phase);
        const ids = opts.companyIds.filter((id) => !scrapeFails.includes(id));
        updateJobsStore((s) => ({ ...s, jobs: [...s.jobs, ...ids.map((id) => ({ id: `${id}:new`, company: { id }, title: "Product Designer" }))] }));
        return {
          report: [],
          okSources: ids.length,
          errorSources: scrapeFails.length,
          failed: ids.length === 0 && scrapeFails.length > 0,
          okCompanyIds: ids,
          errorCompanyIds: opts.companyIds.filter((id) => scrapeFails.includes(id)),
        };
      },
      async scoreJobs(opts) {
        calls.score.push(opts);
        calls.phases.push(getUpdateStatus().phase);
        assert.equal(opts.abortOnApiError, true);
        opts.onCall();
        if (score === "abort") return { status: "ok", scored: [], failed: [{ kind: "api-error" }], aborted: "credit balance too low" };
        return { status: "ok", scored: opts.onlyIds.map((id) => ({ id, score: 80 })), failed: [] };
      },
    },
  };
}

beforeEach(() => {
  clock = T0;
  resetSchedulerForTests();
  seed();
});

// ─── Which companies need work ──────────────────────────────────────────────────────────────────

test("a new company is one with no companyMeta; set-up and no_source companies need nothing", () => {
  const work = (meta) => companiesNeedingWork([company("a"), company("b")], meta, T0);
  assert.deepEqual(work({}).detect.map((c) => c.id), ["a", "b"]);
  assert.deepEqual(work({ a: okMeta }).detect.map((c) => c.id), ["b"]);
  assert.deepEqual(work({ a: okMeta, b: { scrapeStatus: "no_source" } }), { detect: [], scrape: [] });
  // Detected but not yet scraped: scrape only. Companies set up before this feature have no scrapePending.
  assert.deepEqual(work({ a: { ...okMeta, scrapePending: true }, b: okMeta }), { detect: [], scrape: [company("a")] });
  // A detection that errored (network) is retried.
  assert.deepEqual(work({ a: okMeta, b: { scrapeStatus: "error" } }).detect.map((c) => c.id), ["b"]);
  assert.equal(hasNoDomain({ isCustom: true, domain: null }), true);
  assert.equal(hasNoDomain({ isCustom: false, domain: null }), false);
});

test("a failing company backs off 30 minutes, then 2 hours, then stops for the day", () => {
  const meta = (attempts, lastAt) => ({ scrapeStatus: "error", workAttempts: attempts, workLastAttemptAt: new Date(lastAt).toISOString(), workSlot: "2026-10-21T16:00:00.000Z" });
  const c = company("a");
  assert.equal(companyNeeds(c, meta(1, T0), T0 + 29 * MIN).waiting.reason, "backoff");
  assert.equal(companyNeeds(c, meta(1, T0), T0 + 30 * MIN).needs, "detect");
  assert.equal(companyNeeds(c, meta(2, T0), T0 + 119 * MIN).waiting.reason, "backoff");
  assert.equal(companyNeeds(c, meta(2, T0), T0 + 120 * MIN).needs, "detect");
  assert.equal(companyNeeds(c, meta(3, T0), T0 + 5 * 60 * MIN).waiting.reason, "daily-cap");
  // The next 9 AM starts over.
  assert.equal(companyNeeds(c, meta(3, T0), Date.parse("2026-10-22T16:30:00Z")).needs, "detect");
});

// ─── The background work ────────────────────────────────────────────────────────────────────────

test("only new companies are detected and scraped, only their jobs scored, no Others, lastScrapeAt untouched", async () => {
  const { calls, deps } = fakes({ detect: { c3: "no_source" } });
  const before = getState().meta.lastScrapeAt;
  const result = await triggerCompanyWork(deps);

  assert.deepEqual(calls.detect, ["c2", "c3"], "c1 was already set up");
  assert.equal(calls.scrape.length, 1);
  assert.deepEqual(calls.scrape[0], { companyIds: ["c2"] }, "a targeted scrape: c3 has no source, c1 is not new");
  assert.deepEqual(calls.score[0].onlyIds, ["c2:new"], "only the new company's jobs are scored");
  assert.deepEqual(calls.phases, ["scraping", "scraping", "scraping", "scoring"]);

  assert.equal(result.outcome, "done");
  assert.equal(result.newJobs, 1);
  const state = getState();
  assert.equal(state.meta.lastScrapeAt, before);
  assert.equal(state.companyMeta.c2.scrapeStatus, "ok");
  assert.equal(state.companyMeta.c2.scrapePending, false);
  assert.equal(state.companyMeta.c1.scrapePending, undefined, "an existing company is untouched");

  // The status route's source: idle, done, the new job count (the toast).
  const status = getUpdateStatus();
  assert.deepEqual([status.state, status.outcome, status.newJobs], ["idle", "done", 1]);
  assert.equal(getSchedulerStore().lastRun.kind, "new-companies");
});

test("no_source is recorded with a time, shows no failure, and is never probed again", async () => {
  const { calls, deps } = fakes({ detect: { c2: "no_source", c3: "no_source" } });
  const result = await triggerCompanyWork(deps);
  assert.equal(result.outcome, "done", "no source is not a failure");
  assert.equal(calls.scrape.length, 0);
  assert.equal(calls.score.length, 0);
  assert.deepEqual(result.noSource.sort(), ["c2", "c3"]);
  for (const id of ["c2", "c3"]) {
    assert.equal(getState().companyMeta[id].scrapeStatus, "no_source");
    assert.ok(getState().companyMeta[id].noSourceAt);
  }
  clock += 60 * MIN;
  assert.equal((await triggerCompanyWork(deps)).skipped, "nothing");
  assert.deepEqual(calls.detect, ["c2", "c3"], "not re-probed");
});

test("a custom company with no domain is recorded as no_source without a request", async () => {
  seed({ watchlist: [company("c9", { isCustom: true, domain: null })], meta: {} });
  const { calls, deps } = fakes();
  await triggerCompanyWork(deps);
  assert.deepEqual(calls.detect, []);
  assert.equal(getState().companyMeta.c9.scrapeStatus, "no_source");
});

test("while the lock is busy nothing runs and nothing is lost: the next tick does the same work", async () => {
  const lock = acquireRunLock("replace-resume");
  assert.equal(lock.ok, true);
  const { calls, deps } = fakes();
  try {
    const result = await triggerCompanyWork(deps);
    assert.equal(result.skipped, "locked");
    assert.equal(result.waiting, 2);
    assert.deepEqual([calls.detect.length, calls.scrape.length], [0, 0]);
    assert.equal(getState().companyMeta.c2, undefined, "no attempt counted, still new");
    assert.equal(getSchedulerStore().lastRun, null);
  } finally {
    lock.release();
  }
  // The scheduler's next tick (daily work already done today) picks them up.
  writeData("scheduler.json", {
    schemaVersion: 1,
    slot: { start: "2026-10-21T16:00:00.000Z", attempts: 1, lastAttemptAt: new Date(T0 - 5 * MIN).toISOString(), scoringDone: true },
    lastRun: null,
  });
  clock += 15 * MIN;
  const tick = await runTick(deps);
  assert.equal(tick.skipped, "up-to-date", "the daily check did nothing");
  assert.equal(tick.companies.outcome, "done");
  assert.deepEqual(calls.detect, ["c2", "c3"]);
  assert.deepEqual(calls.scrape[0], { companyIds: ["c2", "c3"] });
});

test("a save while a scheduler check is running waits for the next check", async () => {
  const { calls, deps } = fakes();
  let release;
  const slow = { ...deps, async runScrape() { await new Promise((r) => { release = r; }); return { okCompanyIds: [], errorCompanyIds: [] }; } };
  seed({ meta: { c1: { ...okMeta, scrapePending: true } } });
  const first = triggerCompanyWork(slow);
  await new Promise((r) => setTimeout(r, 20));
  const detectedByFirst = calls.detect.length;
  try {
    assert.equal((await triggerCompanyWork(deps)).skipped, "busy");
    assert.equal(calls.detect.length, detectedByFirst, "the second save started nothing");
  } finally {
    release();
    await first;
  }
});

test("failed detection or scrape is counted, backed off and not retried in a loop", async () => {
  const { calls, deps } = fakes({ detect: { c2: "throw", c3: "error" } });
  const first = await triggerCompanyWork(deps);
  assert.equal(first.outcome, "failed");
  assert.equal(first.failedPhase, "scraping");
  assert.equal(getUpdateStatus().state, "failed");
  assert.equal(getState().companyMeta.c2.workAttempts, 1);

  clock += 10 * MIN;
  assert.equal((await triggerCompanyWork(deps)).skipped, "nothing", "inside the 30-minute backoff");
  clock += 21 * MIN;
  assert.equal((await triggerCompanyWork(deps)).ran, true);
  clock += 125 * MIN;
  assert.equal((await triggerCompanyWork(deps)).ran, true);
  assert.equal(calls.detect.filter((id) => id === "c2").length, 3);
  clock += 6 * 60 * MIN;
  assert.equal((await triggerCompanyWork(deps)).skipped, "nothing", "three attempts is the day's cap");
  assert.equal(calls.detect.filter((id) => id === "c2").length, 3);
});

test("a company whose scrape failed stays pending and is retried later, scrape only", async () => {
  const bad = fakes({ scrapeFails: ["c2"], detect: { c3: "no_source" } });
  const first = await triggerCompanyWork(bad.deps);
  // c3 (no source) counts as worked, so this is a partial result, not a failed run.
  assert.equal(first.outcome, "done");
  assert.equal(getState().companyMeta.c2.scrapePending, true);

  clock += 31 * MIN;
  const good = fakes();
  const retry = await triggerCompanyWork(good.deps);
  assert.equal(retry.outcome, "done");
  assert.deepEqual(good.calls.detect, [], "already detected: no new probe");
  assert.deepEqual(good.calls.scrape[0], { companyIds: ["c2"] });
  assert.equal(getState().companyMeta.c2.scrapePending, false);
});

test("without an active resume or finished onboarding it still detects and scrapes, but scores nothing", async () => {
  for (const opts of [{ resume: false }, { onboarded: false }]) {
    resetSchedulerForTests();
    seed(opts);
    const { calls, deps } = fakes();
    const result = await triggerCompanyWork(deps);
    assert.equal(result.outcome, "done");
    assert.deepEqual(calls.detect, ["c2", "c3"]);
    assert.equal(calls.scrape.length, 1);
    assert.equal(calls.score.length, 0);
  }
});

test("scoring that stops on an API error ends the run as failed; the companies stay scraped", async () => {
  const { deps } = fakes({ score: "abort" });
  const result = await triggerCompanyWork(deps);
  assert.equal(result.outcome, "failed");
  assert.equal(result.failedPhase, "scoring");
  assert.equal(getState().companyMeta.c2.scrapePending, false);
});

// ─── The route ──────────────────────────────────────────────────────────────────────────────────

test("PUT /api/watchlist answers at once and only notifies; with no handler it only writes the list", async () => {
  seed();
  const app = express();
  app.use(express.json());
  app.use("/api", stateRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const put = (items) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/watchlist`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
  try {
    // No handler registered (the scheduler is off, or a test): just the write.
    setWatchlistSavedHandler(null);
    assert.equal((await put([company("n1")])).status, 200);
    assert.equal(getState().watchlist[0].id, "n1");

    // A handler that never finishes does not hold the response.
    let calls = 0;
    setWatchlistSavedHandler(() => {
      calls += 1;
      return new Promise(() => {});
    });
    const started = Date.now();
    const res = await put([company("n1"), company("n2")]);
    assert.equal(res.status, 200);
    assert.ok(Date.now() - started < 1000);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 1);

    // A handler that throws never turns the save into an error.
    setWatchlistSavedHandler(() => {
      throw new Error("boom");
    });
    assert.equal((await put([company("n3")])).status, 200);
    notifyWatchlistSaved();
  } finally {
    setWatchlistSavedHandler(null);
    await new Promise((resolve) => server.close(resolve));
  }
});

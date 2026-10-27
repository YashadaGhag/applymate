// Run with: node --test server/routes/lastViewed.test.js
// The Watchlist tab's red dot: what counts as new, the null start, only visible jobs, Others never,
// and the server-stamped last-viewed route. No network, no AI (the key is removed), temp data folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-lastviewed-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
const readData = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf-8"));

const { default: stateRouter } = await import("./state.js");
const { default: jobsRouter } = await import("./jobs.js");

const VIEWED = "2026-10-20T12:00:00.000Z";
const BEFORE = "2026-10-19T12:00:00.000Z";
const AFTER = "2026-10-21T12:00:00.000Z";

const wlJob = (id, extra = {}) => ({
  id,
  source: "greenhouse",
  company: { id: "c1", name: "Acme", domain: "acme.test" },
  title: "Senior Product Designer",
  location: "-United States,",
  workMode: "remote",
  postedAt: AFTER,
  postedAtKind: "posted",
  firstSeenAt: AFTER,
  isInitialScrape: false,
  applyUrl: `https://acme.test/${id}`,
  compensation: null,
  descriptionText: "A role.",
  descriptionHtml: "<p>A role.</p>",
  closed: false,
  ...extra,
});
const othersJob = (id, extra = {}) =>
  wlJob(id, { company: { id: "others:beta", name: "Beta", domain: "beta.test" }, ...extra });

// One new, visible Watchlist job unless a case spoils it.
function seed({ lastViewed = VIEWED, job = wlJob("a"), jobs = null, score = 82, scored = true, dismissed = [], applications = {} } = {}) {
  writeData("store.json", {
    schemaVersion: 1,
    watchlist: [{ id: "c1", name: "Acme", domain: "acme.test", isCustom: false, addedAt: BEFORE }],
    companyMeta: { c1: { scrapeStatus: "ok" } },
    profile: {
      roles: ["Product Designer"],
      locations: [{ label: "Austin, Texas", city: "Austin", region: "Texas", country: "United States", countryCode: "US" }],
      workTypes: ["Remote"],
    },
    userState: { savedJobIds: [], dismissedJobIds: dismissed, lastViewed: { watchlist: lastViewed } },
    meta: { lastScrapeAt: AFTER },
  });
  const list = jobs ?? [job];
  writeData("jobs.json", { schemaVersion: 1, jobs: list });
  writeData("resumes.json", { schemaVersion: 1, currentVersion: "v1", versions: { v1: {} }, replacement: null });
  writeData("scores.json", {
    schemaVersion: 1,
    scores: scored ? Object.fromEntries(list.map((j) => [j.id, { score, resumeVersion: "v1", reasoning: "Fits.", highlights: [] }])) : {},
    pending: null,
    failures: {},
  });
  writeData("applications.json", { schemaVersion: 1, applications });
}

async function withApp(fn) {
  const app = express();
  app.use(express.json());
  app.use("/api", stateRouter);
  app.use("/api", jobsRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await fn(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const dot = async (call) => (await call("GET", "/jobs")).body.hasNewWatchlistJobs;

test("a visible job first seen after last-viewed shows the dot", async () => {
  seed();
  await withApp(async (call) => assert.equal(await dot(call), true));
});

test("no stored last-viewed means no dot, even with a new job", async () => {
  seed({ lastViewed: null });
  await withApp(async (call) => assert.equal(await dot(call), false));
});

test("jobs first seen before last-viewed, or from an initial scrape, never count", async () => {
  seed({ job: wlJob("a", { firstSeenAt: BEFORE }) });
  await withApp(async (call) => assert.equal(await dot(call), false));
  seed({ job: wlJob("a", { isInitialScrape: true }) });
  await withApp(async (call) => assert.equal(await dot(call), false));
});

test("only jobs the tab can show count: scored 50 or more, open, not dismissed, not applied", async () => {
  const cases = [
    ["unscored", { scored: false }],
    ["scored below 50", { score: 49 }],
    ["closed", { job: wlJob("a", { closed: true }) }],
    ["dismissed", { dismissed: ["a"] }],
    ["applied", { applications: { a: { jobId: "a", status: "applied" } } }],
    ["interviewing", { applications: { a: { jobId: "a", status: "interviewing" } } }],
  ];
  for (const [name, opts] of cases) {
    seed(opts);
    await withApp(async (call) => assert.equal(await dot(call), false, name));
  }
  // Exactly 50 is shown, and a pending application stays listed.
  seed({ score: 50 });
  await withApp(async (call) => assert.equal(await dot(call), true, "50 is shown"));
  seed({ applications: { a: { jobId: "a", status: "pending" } } });
  await withApp(async (call) => assert.equal(await dot(call), true, "pending stays listed"));
});

test("a job filtered out by the prefilter never counts", async () => {
  seed({ job: wlJob("a", { title: "Brand Designer" }) });
  await withApp(async (call) => assert.equal(await dot(call), false));
});

test("Others never triggers the dot", async () => {
  seed({ jobs: [othersJob("o1")] });
  await withApp(async (call) => {
    const { body } = await call("GET", "/jobs");
    assert.equal(body.others.length, 1, "the new Others job is listed");
    assert.equal(body.hasNewWatchlistJobs, false);
  });
});

test("PUT stamps the server clock, ignores a body, and ?ifUnset only fills an empty value", async () => {
  seed({ lastViewed: null });
  await withApp(async (call) => {
    const t0 = Date.now();
    const first = await call("PUT", "/user-state/last-viewed/watchlist?ifUnset=true", { watchlist: "1999-01-01T00:00:00Z" });
    const stamped = first.body.userState.lastViewed.watchlist;
    assert.ok(Date.parse(stamped) >= t0 - 1000 && Date.parse(stamped) <= Date.now() + 1000, "server time, not the body's");
    assert.equal(readData("store.json").userState.lastViewed.watchlist, stamped);

    // Arrival with a value already stored changes nothing.
    await new Promise((r) => setTimeout(r, 5));
    const again = await call("PUT", "/user-state/last-viewed/watchlist?ifUnset=true");
    assert.equal(again.body.userState.lastViewed.watchlist, stamped);

    // Leaving stamps again, later.
    const leave = await call("PUT", "/user-state/last-viewed/watchlist");
    assert.ok(Date.parse(leave.body.userState.lastViewed.watchlist) > Date.parse(stamped));
  });
});

test("arrival keeps the dot; leaving clears it", async () => {
  seed();
  await withApp(async (call) => {
    assert.equal(await dot(call), true);
    await call("PUT", "/user-state/last-viewed/watchlist?ifUnset=true"); // arrival: a value exists, no change
    assert.equal(await dot(call), true);
    // Leave: last-viewed becomes "now", later than the job's firstSeenAt in this fixture.
    seed({ job: wlJob("a", { firstSeenAt: BEFORE }), lastViewed: BEFORE });
    assert.equal(await dot(call), false);
    seed({ job: wlJob("a", { firstSeenAt: new Date(Date.now() - 60_000).toISOString() }), lastViewed: BEFORE });
    assert.equal(await dot(call), true);
    await call("PUT", "/user-state/last-viewed/watchlist");
    assert.equal(await dot(call), false);
  });
});

test("last-viewed cannot be written through PATCH, and other PATCH writes leave it alone", async () => {
  seed();
  await withApp(async (call) => {
    const bad = await call("PATCH", "/user-state", { lastViewed: { watchlist: AFTER } });
    assert.equal(bad.status, 400);
    const ok = await call("PATCH", "/user-state", { savedJobIds: ["a"] });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.userState.lastViewed.watchlist, VIEWED);
  });
});

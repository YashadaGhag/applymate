// Run with: node --test server/routes/savedJobs.test.js
// No network and no model calls: routes run against a temp data folder with fixture jobs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-saved-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
const readData = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf-8"));

const { default: stateRouter } = await import("./state.js");
const { default: savedJobsRouter } = await import("./savedJobs.js");

const NOW = new Date().toISOString();
const job = (id, extra = {}) => ({
  id,
  source: "greenhouse",
  company: { id: "c1", name: "Acme", domain: "acme.test" },
  title: "Product Designer",
  location: "-Seattle, WA,",
  workMode: "hybrid",
  postedAt: NOW,
  firstSeenAt: NOW,
  applyUrl: `https://acme.test/${id}`,
  compensation: { min: 160000, max: 210000, currency: "USD" },
  descriptionText: "A role.",
  closed: false,
  ...extra,
});

function seed({ saved = [], savedAt, scores = {} } = {}) {
  writeData("store.json", {
    schemaVersion: 1,
    watchlist: [],
    companyMeta: {},
    profile: null,
    userState: { savedJobIds: saved, dismissedJobIds: [], ...(savedAt ? { savedAt } : {}), lastViewed: { watchlist: null } },
    meta: { lastScrapeAt: null },
  });
  writeData("jobs.json", { schemaVersion: 1, jobs: [job("a"), job("b", { closed: true, compensation: null }), job("c")] });
  writeData("resumes.json", { schemaVersion: 1, currentVersion: "v1", versions: { v1: {} }, replacement: null });
  writeData("scores.json", { schemaVersion: 1, scores, pending: null, failures: {} });
}

async function withApp(fn) {
  const app = express();
  app.use(express.json());
  app.use("/api", stateRouter);
  app.use("/api", savedJobsRouter);
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

test("saving stamps savedAt once; saving again keeps it; unsaving drops it", async () => {
  seed();
  await withApp(async (call) => {
    const before = Date.now();
    await call("PUT", "/user-state/saved/a");
    const stamp = readData("store.json").userState.savedAt.a;
    assert.ok(new Date(stamp).getTime() >= before - 1000);

    await new Promise((r) => setTimeout(r, 5));
    await call("PUT", "/user-state/saved/a");
    assert.equal(readData("store.json").userState.savedAt.a, stamp);

    await call("DELETE", "/user-state/saved/a");
    assert.equal("a" in readData("store.json").userState.savedAt, false);
    assert.deepEqual(readData("store.json").userState.savedJobIds, []);
  });
});

test("a job saved before dates were kept stays undated, and dismiss removes any date", async () => {
  seed({ saved: ["a"] });
  await withApp(async (call) => {
    await call("PUT", "/user-state/saved/a");
    assert.equal(readData("store.json").userState.savedAt?.a, undefined);
    await call("PUT", "/user-state/saved/c");
    assert.ok(readData("store.json").userState.savedAt.c);
    await call("PUT", "/user-state/dismissed/c");
    assert.equal(readData("store.json").userState.savedAt.c, undefined);
  });
});

test("PATCH cannot write savedAt", async () => {
  seed();
  await withApp(async (call) => {
    assert.equal((await call("PATCH", "/user-state", { savedAt: { a: "2000-01-01T00:00:00.000Z" } })).status, 400);
    assert.equal(readData("store.json").userState.savedAt, undefined);
  });
});

test("GET /saved-jobs: light shape, newest saved first, undated last", async () => {
  seed({
    saved: ["a", "b", "c"],
    savedAt: { a: "2026-10-01T00:00:00.000Z", c: "2026-10-10T00:00:00.000Z" },
    scores: { a: { score: 82.4, resumeVersion: "v1", reasoning: "Fits.", highlights: [] } },
  });
  await withApp(async (call) => {
    const { body } = await call("GET", "/saved-jobs");
    assert.deepEqual(body.savedJobs.map((j) => j.id), ["c", "a", "b"]);
    const a = body.savedJobs.find((j) => j.id === "a");
    assert.deepEqual(a, {
      id: "a",
      source: "greenhouse",
      company: { name: "Acme", domain: "acme.test" },
      title: "Product Designer",
      location: "Seattle, WA",
      workMode: "hybrid",
      compensation: "$160k - $210k",
      closed: false,
      applyUrl: "https://acme.test/a",
      score: 82,
      savedAt: "2026-10-01T00:00:00.000Z",
    });
    const b = body.savedJobs.find((j) => j.id === "b");
    assert.equal(b.closed, true);
    assert.equal(b.compensation, null);
    assert.equal(b.savedAt, null);
    assert.equal(b.score, null);
  });
});

test("GET /saved-jobs: a score below 50 or for an older resume is not shown; a missing job is skipped", async () => {
  seed({
    saved: ["a", "c", "gone"],
    scores: {
      a: { score: 40, resumeVersion: "v1", reasoning: "x", highlights: [] },
      c: { score: 90, resumeVersion: "old", reasoning: "x", highlights: [] },
    },
  });
  await withApp(async (call) => {
    const { body } = await call("GET", "/saved-jobs");
    assert.deepEqual(body.savedJobs.map((j) => [j.id, j.score]).sort(), [["a", null], ["c", null]]);
  });
});

// ─── The one-time "Customizing resume…" tip (userState.customizeTipSeenAt) ─────────────────────

test("the customize tip flag: unset at first, stamped once, kept on repeat, not writable through PATCH", async () => {
  seed();
  await withApp(async (call) => {
    let { body } = await call("GET", "/state");
    assert.ok(!body.userState.customizeTipSeenAt); // never seen: the page shows the tip

    // PATCH can't set it (only the dedicated route can).
    assert.equal((await call("PATCH", "/user-state", { customizeTipSeenAt: "2020-01-01T00:00:00.000Z" })).status, 400);

    const first = await call("PUT", "/user-state/customize-tip-seen");
    assert.equal(first.status, 200);
    const stamped = first.body.userState.customizeTipSeenAt;
    assert.ok(stamped);

    const again = await call("PUT", "/user-state/customize-tip-seen");
    assert.equal(again.body.userState.customizeTipSeenAt, stamped); // a repeat keeps the first time

    ({ body } = await call("GET", "/state"));
    assert.equal(body.userState.customizeTipSeenAt, stamped); // read back on every later visit
    assert.deepEqual(readData("store.json").userState.savedJobIds, []); // nothing else touched
  });
});

// ─── The two one-time Job Details tips (downloadFilesTipSeenAt, markAppliedTipSeenAt) ───────────

for (const [field, route] of [
  ["downloadFilesTipSeenAt", "/user-state/download-files-tip-seen"],
  ["markAppliedTipSeenAt", "/user-state/mark-applied-tip-seen"],
]) {
  test(`the ${field} flag: unset at first, stamped once, kept on repeat, not writable through PATCH, others untouched`, async () => {
    seed();
    await withApp(async (call) => {
      let { body } = await call("GET", "/state");
      assert.ok(!body.userState[field]); // never seen: the page shows the tip

      // PATCH can't set it (only the dedicated route can).
      assert.equal((await call("PATCH", "/user-state", { [field]: "2020-01-01T00:00:00.000Z" })).status, 400);

      const first = await call("PUT", route);
      assert.equal(first.status, 200);
      const stamped = first.body.userState[field];
      assert.ok(stamped);

      const again = await call("PUT", route);
      assert.equal(again.body.userState[field], stamped); // a repeat keeps the first time

      ({ body } = await call("GET", "/state"));
      assert.equal(body.userState[field], stamped); // read back on every later visit

      // Each tip has its own flag: the other two are still unset, and nothing else changed.
      for (const other of ["customizeTipSeenAt", "downloadFilesTipSeenAt", "markAppliedTipSeenAt"]) {
        if (other !== field) assert.ok(!body.userState[other], `${other} stays unset`);
      }
      assert.deepEqual(readData("store.json").userState.savedJobIds, []);
    });
  });
}

test("a body sent to a tip route cannot unset its flag", async () => {
  seed();
  await withApp(async (call) => {
    const { body } = await call("PUT", "/user-state/mark-applied-tip-seen");
    const stamped = body.userState.markAppliedTipSeenAt;
    const withBody = await call("PUT", "/user-state/mark-applied-tip-seen", { markAppliedTipSeenAt: null });
    assert.equal(withBody.body.userState.markAppliedTipSeenAt, stamped);
  });
});

// Run with: node --test server/routes/applications.test.js
// No network and no model calls: the routes run against a temp data folder with fixture jobs and
// scores, and ANTHROPIC_API_KEY is removed so a stray call would throw instead of spending.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-apps-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));

const { STATUSES, canChangeStatus, canArchive, appliedJobIds } = await import("../applications/status.js");
const { default: applicationsRouter } = await import("./applications.js");
const { default: jobsRouter } = await import("./jobs.js");

const NOW = new Date().toISOString();
const watchlistJob = {
  id: "greenhouse:acme:1",
  source: "greenhouse",
  company: { id: "c1", name: "Acme", domain: "acme.test" },
  title: "Senior Product Designer",
  location: "-United States,",
  workMode: "remote",
  postedAt: NOW,
  postedAtKind: "posted",
  firstSeenAt: NOW,
  applyUrl: "https://acme.test/apply/1",
  compensation: { min: 160000, max: 210000, currency: "USD" },
  descriptionText: "A role.",
  descriptionHtml: "<p>A role.</p>",
  closed: false,
};
const othersJob = {
  ...watchlistJob,
  id: "others:beta:2",
  company: { id: "others:beta", name: "Beta", domain: "beta.test" },
  title: "Product Designer",
  applyUrl: "https://beta.test/apply/2",
  compensation: null,
};
const closedJob = { ...watchlistJob, id: "greenhouse:acme:3", title: "Product Designer II", closed: true };

function seed() {
  fs.rmSync(path.join(dataDir, "applications.json"), { force: true });
  writeData("store.json", {
    schemaVersion: 1,
    watchlist: [{ id: "c1", name: "Acme", domain: "acme.test", isCustom: false, addedAt: NOW }],
    companyMeta: { c1: { scrapeStatus: "ok" } },
    profile: {
      roles: ["Product Designer"],
      locations: [{ label: "Austin, Texas", city: "Austin", region: "Texas", country: "United States", countryCode: "US" }],
      workTypes: ["Remote"],
    },
    userState: { savedJobIds: [], dismissedJobIds: [], lastViewed: { watchlist: null } },
    meta: { lastScrapeAt: NOW },
  });
  writeData("jobs.json", { schemaVersion: 1, jobs: [watchlistJob, othersJob, closedJob] });
  writeData("resumes.json", { schemaVersion: 1, currentVersion: "v1", versions: { v1: {} }, replacement: null });
  writeData("scores.json", {
    schemaVersion: 1,
    scores: {
      [watchlistJob.id]: { score: 82.4, resumeVersion: "v1", reasoning: "Fits.", highlights: [] },
      [othersJob.id]: { score: 70, resumeVersion: "v1", reasoning: "Fits.", highlights: [] },
    },
    pending: null,
    failures: {},
  });
}

async function withApp(fn) {
  seed();
  const app = express();
  app.use(express.json());
  app.use("/api", applicationsRouter);
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

const enc = encodeURIComponent;
const pending = (call, job = watchlistJob) => call("POST", `/applications/${enc(job.id)}/pending`);
const setStatus = (call, status, job = watchlistJob) => call("PUT", `/applications/${enc(job.id)}/status`, { status });
const listedIds = async (call) => {
  const { body } = await call("GET", "/jobs");
  return [...body.watchlistGroups.flatMap((g) => g.jobs), ...body.others].map((j) => j.id);
};

// ─── The rules themselves ───────────────────────────────────────────────────────────────────────

test("allowed status changes follow the Tracker menu", () => {
  const allowed = {
    pending: ["applied"],
    applied: ["interviewing", "offer", "not_moving_forward", "pending"],
    interviewing: ["offer", "not_moving_forward"],
    offer: [],
    not_moving_forward: [],
  };
  for (const from of STATUSES) {
    for (const to of STATUSES) assert.equal(canChangeStatus(from, to), allowed[from].includes(to), `${from} → ${to}`);
  }
});

test("archive is allowed from interviewing, offer and not_moving_forward only", () => {
  assert.deepEqual(STATUSES.filter(canArchive), ["interviewing", "offer", "not_moving_forward"]);
});

test("only statuses past pending count as applied", () => {
  const ids = appliedJobIds({
    a: { jobId: "a", status: "pending" },
    b: { jobId: "b", status: "applied" },
    c: { jobId: "c", status: "not_moving_forward" },
  });
  assert.deepEqual([...ids].sort(), ["b", "c"]);
});

// ─── Routes ─────────────────────────────────────────────────────────────────────────────────────

test("GET returns null before a record exists", async () => {
  await withApp(async (call) => {
    assert.deepEqual((await call("GET", `/applications/${enc(watchlistJob.id)}`)).body, { application: null });
    assert.deepEqual((await call("GET", "/applications")).body, { applications: [] });
  });
});

test("pending creates a record with a snapshot of the job", async () => {
  await withApp(async (call) => {
    const res = await pending(call);
    assert.equal(res.status, 201);
    const app = res.body.application;
    assert.equal(app.status, "pending");
    assert.equal(app.archived, false);
    assert.equal(app.appliedAt, null);
    assert.equal(app.scoreAtApply, null);
    assert.equal(app.statusHistory.length, 1);
    assert.equal(app.statusHistory[0].status, "pending");
    assert.deepEqual(app.job, {
      company: { name: "Acme", domain: "acme.test" },
      companyId: "c1",
      title: "Senior Product Designer",
      location: "United States",
      compensation: "$160k - $210k",
      applyUrl: "https://acme.test/apply/1",
      source: "greenhouse",
    });
  });
});

test("snapshot uses null for anything unknown", async () => {
  await withApp(async (call) => {
    const res = await pending(call, othersJob);
    assert.equal(res.body.application.job.compensation, null);
  });
});

test("pending is idempotent and never resets a later status", async () => {
  await withApp(async (call) => {
    const first = (await pending(call)).body.application;
    const again = await pending(call);
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.application, first);

    await setStatus(call, "applied");
    const afterApplied = (await pending(call)).body.application;
    assert.equal(afterApplied.status, "applied");
    assert.equal(afterApplied.statusHistory.length, 2);
    assert.equal((await call("GET", "/applications")).body.applications.length, 1);
  });
});

test("pending: 404 for an unknown job, 409 for a closed job, nothing created", async () => {
  await withApp(async (call) => {
    assert.equal((await call("POST", "/applications/nope/pending")).status, 404);
    assert.equal((await pending(call, closedJob)).status, 409);
    assert.deepEqual((await call("GET", "/applications")).body, { applications: [] });
  });
});

test("status: 400 for a bad status, 404 with no record, 409 for a change that isn't allowed", async () => {
  await withApp(async (call) => {
    assert.equal((await setStatus(call, "applied")).status, 404);
    await pending(call);
    assert.equal((await setStatus(call, "hired")).status, 400);
    assert.equal((await call("PUT", `/applications/${enc(watchlistJob.id)}/status`, {})).status, 400);
    assert.equal((await setStatus(call, "offer")).status, 409);
    assert.equal((await setStatus(call, "pending")).status, 409);

    assert.equal((await setStatus(call, "applied")).status, 200);
    assert.equal((await setStatus(call, "applied")).status, 409);
    assert.equal((await setStatus(call, "interviewing")).status, 200);
    assert.equal((await setStatus(call, "offer")).status, 200);
    assert.equal((await setStatus(call, "interviewing")).status, 409);
    assert.equal((await setStatus(call, "not_moving_forward")).status, 409);
  });
});

test("pending to applied sets appliedAt and the rounded score, and each change adds a history entry", async () => {
  await withApp(async (call) => {
    await pending(call);
    const { body } = await setStatus(call, "applied");
    assert.equal(body.application.scoreAtApply, 82);
    assert.ok(body.application.appliedAt);
    await setStatus(call, "interviewing");
    const saved = (await call("GET", `/applications/${enc(watchlistJob.id)}`)).body.application;
    assert.deepEqual(saved.statusHistory.map((h) => h.status), ["pending", "applied", "interviewing"]);
    assert.equal(saved.scoreAtApply, 82);
  });
});

test("revert: applied → pending clears appliedAt and scoreAtApply, keeps the snapshot and history, and the job is listed again", async () => {
  await withApp(async (call) => {
    await pending(call);
    const created = (await call("GET", `/applications/${enc(watchlistJob.id)}`)).body.application;
    await setStatus(call, "applied");
    assert.ok(!(await listedIds(call)).includes(watchlistJob.id));

    const { status, body } = await setStatus(call, "pending");
    assert.equal(status, 200);
    const reverted = body.application;
    assert.equal(reverted.status, "pending");
    assert.equal(reverted.appliedAt, null);
    assert.equal(reverted.scoreAtApply, null);
    assert.equal(reverted.archived, false);
    assert.equal(reverted.createdAt, created.createdAt);
    assert.deepEqual(reverted.job, created.job);
    assert.deepEqual(reverted.statusHistory.map((h) => h.status), ["pending", "applied", "pending"]);
    assert.ok((await listedIds(call)).includes(watchlistJob.id)); // pending jobs stay listed

    // Marking it applied again stamps a fresh date and score.
    const again = (await setStatus(call, "applied")).body.application;
    assert.ok(again.appliedAt);
    assert.equal(again.scoreAtApply, 82);
  });
});

test("revert is blocked from every status but applied", async () => {
  await withApp(async (call) => {
    await pending(call);
    assert.equal((await setStatus(call, "pending")).status, 409); // pending → pending
    await setStatus(call, "applied");
    await setStatus(call, "interviewing");
    assert.equal((await setStatus(call, "pending")).status, 409);
    assert.equal((await setStatus(call, "applied")).status, 409);
    await setStatus(call, "offer");
    assert.equal((await setStatus(call, "pending")).status, 409);
    assert.equal((await setStatus(call, "applied")).status, 409);
    const saved = (await call("GET", `/applications/${enc(watchlistJob.id)}`)).body.application;
    assert.equal(saved.status, "offer");
    assert.ok(saved.appliedAt); // a refused change leaves the record alone
  });
  for (const from of ["interviewing", "offer", "not_moving_forward", "pending"]) {
    assert.equal(canChangeStatus(from, "pending"), false, `${from} → pending`);
  }
});

test("scoreAtApply is null when the job has no current score", async () => {
  await withApp(async (call) => {
    await pending(call);
    writeData("scores.json", { schemaVersion: 1, scores: {}, pending: null, failures: {} });
    assert.equal((await setStatus(call, "applied")).body.application.scoreAtApply, null);
  });
});

test("archive: only from interviewing, offer or not_moving_forward; no unarchive", async () => {
  await withApp(async (call) => {
    const archive = () => call("PUT", `/applications/${enc(watchlistJob.id)}/archive`);
    assert.equal((await archive()).status, 404);
    await pending(call);
    assert.equal((await archive()).status, 409);
    await setStatus(call, "applied");
    assert.equal((await archive()).status, 409);
    await setStatus(call, "interviewing");
    const res = await archive();
    assert.equal(res.status, 200);
    assert.equal(res.body.application.archived, true);
    assert.equal(res.body.application.status, "interviewing");
    assert.equal((await archive()).body.application.archived, true);
  });
});

test("the list is newest first", async () => {
  await withApp(async (call) => {
    await pending(call, watchlistJob);
    await new Promise((r) => setTimeout(r, 5));
    await pending(call, othersJob);
    const ids = (await call("GET", "/applications")).body.applications.map((a) => a.jobId);
    assert.deepEqual(ids, [othersJob.id, watchlistJob.id]);
  });
});

// ─── Job lists ──────────────────────────────────────────────────────────────────────────────────

test("pending jobs stay listed; applied and later jobs leave the Watchlist and Others", async () => {
  await withApp(async (call) => {
    assert.deepEqual((await listedIds(call)).sort(), [othersJob.id, watchlistJob.id].sort());

    await pending(call, watchlistJob);
    await pending(call, othersJob);
    assert.deepEqual((await listedIds(call)).sort(), [othersJob.id, watchlistJob.id].sort());

    await setStatus(call, "applied", watchlistJob);
    assert.deepEqual(await listedIds(call), [othersJob.id]);

    await setStatus(call, "applied", othersJob);
    await setStatus(call, "not_moving_forward", othersJob);
    assert.deepEqual(await listedIds(call), []);
  });
});

test("an applied job is dropped before the Others cap, so the next job takes its place", async () => {
  await withApp(async (call) => {
    const extras = Array.from({ length: 30 }, (_, i) => ({
      ...othersJob,
      id: `others:beta:extra-${i}`,
      title: `Product Designer ${i}`,
    }));
    const scores = Object.fromEntries(extras.map((j) => [j.id, { score: 60, resumeVersion: "v1", reasoning: "Fits.", highlights: [] }]));
    writeData("jobs.json", { schemaVersion: 1, jobs: [othersJob, ...extras] });
    writeData("scores.json", {
      schemaVersion: 1,
      scores: { [othersJob.id]: { score: 90, resumeVersion: "v1", reasoning: "Fits.", highlights: [] }, ...scores },
      pending: null,
      failures: {},
    });
    const before = (await call("GET", "/jobs")).body.others.map((j) => j.id);
    assert.equal(before.length, 30);
    assert.equal(before[0], othersJob.id);

    await pending(call, othersJob);
    await setStatus(call, "applied", othersJob);
    const after = (await call("GET", "/jobs")).body.others.map((j) => j.id);
    assert.equal(after.length, 30);
    assert.ok(!after.includes(othersJob.id));
  });
});

test("the record survives its job leaving jobs.json", async () => {
  await withApp(async (call) => {
    await pending(call);
    writeData("jobs.json", { schemaVersion: 1, jobs: [] });
    const { body } = await call("GET", `/applications/${enc(watchlistJob.id)}`);
    assert.equal(body.application.job.title, "Senior Product Designer");
    assert.equal((await setStatus(call, "applied")).body.application.scoreAtApply, null);
  });
});

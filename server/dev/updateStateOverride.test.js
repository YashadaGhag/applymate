// Run with: node --test server/dev/updateStateOverride.test.js
// The DEV ONLY pretend state for GET /api/jobs/update-status. No network, no AI, a temp data folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-update-override-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;

const { overrideStatus, overridePath } = await import("./updateStateOverride.js");
const { default: updateStatusRouter } = await import("../routes/updateStatus.js");

const T = Date.parse("2026-10-21T17:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

test("running reports scraping, then scoring, then ends as done with the new-job count", () => {
  const record = { state: "running", startedAt: iso(T), endsAt: iso(T + 20_000), then: "done", newJobs: 3 };
  assert.deepEqual(
    { state: overrideStatus(record, T + 1000).state, phase: overrideStatus(record, T + 1000).phase },
    { state: "running", phase: "scraping" }
  );
  assert.equal(overrideStatus(record, T + 15_000).phase, "scoring");
  const after = overrideStatus(record, T + 20_000);
  assert.equal(after.state, "idle");
  assert.equal(after.outcome, "done");
  assert.equal(after.newJobs, 3);
});

test("running can end failed; failed, done and idle are fixed states", () => {
  const failing = { state: "running", startedAt: iso(T), endsAt: iso(T + 1000), then: "failed", newJobs: 3 };
  assert.equal(overrideStatus(failing, T + 2000).state, "failed");
  assert.equal(overrideStatus({ state: "failed", startedAt: iso(T), finishedAt: iso(T) }, T).outcome, "failed");
  assert.equal(overrideStatus({ state: "done", startedAt: iso(T), finishedAt: iso(T), newJobs: 0 }, T).newJobs, 0);
  assert.equal(overrideStatus({ state: "idle" }, T).state, "idle");
  assert.equal(overrideStatus(null, T), null);
});

test("the route uses the pretend state, and never over a real running run", async () => {
  const app = express();
  app.use("/api", updateStatusRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const get = async () => (await fetch(`http://127.0.0.1:${server.address().port}/api/jobs/update-status`)).json();
  try {
    assert.equal((await get()).state, "idle");
    fs.writeFileSync(overridePath(), JSON.stringify({ state: "failed", startedAt: iso(T), finishedAt: iso(T) }));
    const pretend = await get();
    assert.equal(pretend.state, "failed");
    assert.equal(pretend.devForced, true);
    fs.rmSync(overridePath());
    assert.equal((await get()).devForced, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

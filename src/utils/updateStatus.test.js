// Run with: node --test src/utils/updateStatus.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { runJustEnded, shouldAnnounceNewJobs } from "./updateStatus.js";

test("a run just ended only when the last read said running and this one does not", () => {
  assert.equal(runJustEnded({ state: "running" }, { state: "idle", outcome: "done" }), true);
  assert.equal(runJustEnded({ state: "running" }, { state: "failed" }), true);
  assert.equal(runJustEnded({ state: "running" }, { state: "running" }), false);
  // Opened after it ended, or first read: nothing was watched.
  assert.equal(runJustEnded(null, { state: "idle", outcome: "done", newJobs: 4 }), false);
  assert.equal(runJustEnded({ state: "idle" }, { state: "idle" }), false);
});

test("the toast needs a successful run that added jobs", () => {
  assert.equal(shouldAnnounceNewJobs({ state: "idle", outcome: "done", newJobs: 2 }), true);
  assert.equal(shouldAnnounceNewJobs({ state: "idle", outcome: "done", newJobs: 0 }), false);
  assert.equal(shouldAnnounceNewJobs({ state: "failed", outcome: "failed", newJobs: 3 }), false);
  assert.equal(shouldAnnounceNewJobs(null), false);
});

import { failedRunKey, isFailedRunDismissed, readDismissedRun, writeDismissedRun } from "./updateStatus.js";

const failed = (finishedAt) => ({ state: "failed", outcome: "failed", startedAt: "2026-10-21T16:00:00Z", finishedAt });

test("a failed run is dismissed only when its own finish time was remembered", () => {
  const run = failed("2026-10-21T16:05:00Z");
  assert.equal(failedRunKey(run), "2026-10-21T16:05:00Z");
  assert.equal(isFailedRunDismissed(run, "2026-10-21T16:05:00Z"), true);
  // A later failed run shows the banner again.
  assert.equal(isFailedRunDismissed(failed("2026-10-22T16:05:00Z"), "2026-10-21T16:05:00Z"), false);
  assert.equal(isFailedRunDismissed(run, null), false);
});

test("an interrupted run (no finish time) is keyed by its start; other states are never dismissed", () => {
  assert.equal(failedRunKey(failed(null)), "2026-10-21T16:00:00Z");
  assert.equal(isFailedRunDismissed({ state: "running", startedAt: "x", finishedAt: null }, "x"), false);
  assert.equal(isFailedRunDismissed({ state: "idle", outcome: "done", finishedAt: "x" }, "x"), false);
  assert.equal(isFailedRunDismissed(null, "x"), false);
});

test("storage that cannot be read or written never throws", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readDismissedRun(broken), null);
  assert.doesNotThrow(() => writeDismissedRun("x", broken));
  const memory = new Map();
  const ok = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  writeDismissedRun("2026-10-21T16:05:00Z", ok);
  assert.equal(readDismissedRun(ok), "2026-10-21T16:05:00Z");
});

// Run with: node --test src/utils/companyCheck.test.js
// The loader's state mapping and copy: no browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loaderState, loaderCopy, LONGER_AFTER_MS } from "./companyCheck.js";

const watchlist = (extra = {}) => ({
  enabled: true,
  total: 8,
  waiting: 0,
  scraped: 8,
  notChecked: [],
  rolesFound: 9,
  companiesWithRoles: 4,
  scoringFailed: false,
  ...extra,
});
const status = (state = "idle", w = {}) => ({ state, watchlist: watchlist(w) });
const kind = (args) => loaderState(args).kind;

test("no read yet shows the checking state with no numbers", () => {
  const s = loaderState({ status: null });
  assert.equal(s.kind, "checking");
  assert.equal(loaderCopy(s).body, "");
});

test("running, or companies still waiting, is checking; it becomes longer after the threshold", () => {
  assert.equal(kind({ status: status("running"), elapsedMs: 1000 }), "checking");
  assert.equal(kind({ status: status("idle", { waiting: 2 }), elapsedMs: 1000 }), "checking");
  assert.equal(kind({ status: status("running"), elapsedMs: LONGER_AFTER_MS - 1 }), "checking");
  assert.equal(kind({ status: status("running"), elapsedMs: LONGER_AFTER_MS }), "longer");
});

test("a retry in flight stays on checking and never flashes the old result", () => {
  const failed = status("failed", { scraped: 0, notChecked: [{ id: "a", name: "Acme" }], total: 1 });
  assert.equal(kind({ status: failed }), "failed");
  assert.equal(kind({ status: failed, retrying: true }), "checking");
});

test("finished with some companies not checked is partial; nothing checked is failed", () => {
  const some = status("idle", { notChecked: [{ id: "a", name: "Acme Robotics" }, { id: "b", name: "Northwind Labs" }], scraped: 6 });
  assert.equal(kind({ status: some }), "partial");
  const none = status("failed", { notChecked: [{ id: "a", name: "Acme" }], scraped: 0, total: 1 });
  assert.equal(kind({ status: none }), "failed");
});

test("a company with no supported source is not a failure: the server leaves it out, so the loader goes on", () => {
  // 3 companies, one of them no_source: it is neither waiting nor in notChecked.
  assert.equal(kind({ status: status("idle", { total: 3, scraped: 2 }) }), "done");
});

test("the scoring step failing after everything was scraped is the failed state", () => {
  assert.equal(kind({ status: status("failed", { scoringFailed: true }) }), "failed");
  // A daily run's old failure is not this one: the server only sets scoringFailed for a new-company run.
  assert.equal(kind({ status: status("failed", { scoringFailed: false }) }), "done");
});

test("with background work off nothing would ever change, so it goes straight on", () => {
  assert.equal(kind({ status: status("idle", { enabled: false, waiting: 3 }) }), "done");
});

test("copy follows the Figma frames", () => {
  const checking = loaderCopy(loaderState({ status: status("running") }));
  assert.deepEqual([checking.heading, checking.body], ["Checking your companies", "Found 9 roles at 4 companies so far"]);

  const early = loaderCopy(loaderState({ status: status("running", { rolesFound: 0, companiesWithRoles: 0 }) }));
  assert.equal(early.body, "Checking 8 companies", "no 'Found 0 roles'");
  assert.equal(loaderCopy(loaderState({ status: status("running", { rolesFound: 1, companiesWithRoles: 1 }) })).body, "Found 1 role at 1 company so far");

  const longer = loaderCopy({ kind: "longer" });
  assert.deepEqual([longer.heading, longer.body], ["Still checking", "Some career pages are slow. This can take up to 5 minutes."]);

  const partial = loaderCopy(
    loaderState({
      status: status("idle", { rolesFound: 14, scraped: 6, notChecked: [{ id: "a", name: "Acme Robotics" }, { id: "b", name: "Northwind Labs" }] }),
    })
  );
  assert.equal(partial.heading, "Checked 6 of 8 companies");
  assert.equal(partial.body, "Found 14 roles so far. We couldn’t reach these careers pages, so we’ll try them again automatically.");
  assert.deepEqual(partial.lines, ["Acme Robotics: careers page didn’t respond", "Northwind Labs: careers page didn’t respond"]);

  const failed = loaderCopy({ kind: "failed", notChecked: [] });
  assert.deepEqual([failed.heading, failed.body], ["We couldn’t check your companies", "Your list is saved. We’ll try again automatically, or you can try now."]);
});

test("one company not checked reads in the singular", () => {
  const p = loaderCopy(loaderState({ status: status("idle", { total: 2, scraped: 1, rolesFound: 0, notChecked: [{ id: "a", name: "Acme" }] }) }));
  assert.equal(p.heading, "Checked 1 of 2 companies");
  assert.equal(p.body, "We couldn’t reach this careers page, so we’ll try it again automatically.");
});

// Run with: node --test server/routes/unsupportedNotice.test.js
// Companies with no supported source: the notice stores nothing, and they are never "not checked"
// in the loader. No network, no AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { watchlistProgress } from "../scheduler/watchlistProgress.js";
import stateRouter from "./state.js";

const company = (id) => ({ id, name: `Co ${id}`, domain: `${id}.test`, isCustom: false, addedAt: "2026-10-01T00:00:00Z" });
const NO_SOURCE = { atsPlatform: null, atsSlug: null, scrapeStatus: "no_source", noSourceAt: "2026-10-21T17:00:00.000Z" };
const progress = (companyMeta) =>
  watchlistProgress({ watchlist: [company("a"), company("b")], companyMeta, jobs: [], scores: {}, resumeVersion: "v1", enabled: true, lastRun: null });

test("unsupported is not failed: the loader never lists it as not checked", () => {
  const p = progress({ a: NO_SOURCE, b: NO_SOURCE });
  assert.deepEqual(p.notChecked, []);
  assert.equal(p.waiting, 0);
});

test("an old store that still has the one-time dismissal field behaves the same", () => {
  const old = { ...NO_SOURCE, noSourceNoticeSeenAt: "2026-10-21T18:00:00.000Z" };
  assert.deepEqual(progress({ a: old, b: NO_SOURCE }), progress({ a: NO_SOURCE, b: NO_SOURCE }));
});

test("there is no dismissal route any more", () => {
  const paths = stateRouter.stack.filter((l) => l.route).map((l) => l.route.path);
  assert.ok(!paths.includes("/watchlist/unsupported-notice-seen"));
});

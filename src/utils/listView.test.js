// Run with: node --test src/utils/listView.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RETURN,
  clampPage,
  lastListUrl,
  parseChoice,
  parsePage,
  patchView,
  readView,
  rememberList,
  resolveReturn,
  shouldRestore,
  withParams,
} from "./listView.js";

function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

test("dismissing the last job on a page lands on the previous page", () => {
  // Others, 5 per page: 11 jobs make 3 pages; the 11th is alone on page 3.
  assert.equal(clampPage(3, 11, 5), 3);
  assert.equal(clampPage(3, 10, 5), 2);
  // A middle page that still has jobs stays where it is.
  assert.equal(clampPage(2, 10, 5), 2);
  // The tab becomes empty: page 1 (the empty state shows).
  assert.equal(clampPage(2, 0, 5), 1);
  assert.equal(clampPage(1, 0, 5), 1);
  // Nonsense pages are pulled in range.
  assert.equal(clampPage(0, 10, 5), 1);
  assert.equal(clampPage(-4, 10, 5), 1);
  assert.equal(clampPage(NaN, 10, 5), 1);
  assert.equal(clampPage(99, 12, 12), 1);
});

test("with no list to return to (direct link, new tab) the way back is the default Job Recommendations view", () => {
  assert.deepEqual(resolveReturn(null), DEFAULT_RETURN);
  assert.deepEqual(resolveReturn(undefined), DEFAULT_RETURN);
  assert.deepEqual(resolveReturn(""), DEFAULT_RETURN);
  assert.deepEqual(DEFAULT_RETURN, { to: "/jobs", label: "Job Recommendations" });
  // Not one of the three lists, not a path, or another site: default.
  for (const bad of ["/preferences?tab=watchlist", "/jobs/abc", "https://evil.example/jobs", "//evil.example/jobs", "jobs", 42, {}]) {
    assert.deepEqual(resolveReturn(bad), DEFAULT_RETURN, String(bad));
  }
});

test("the way back is the list view that was left, with its label", () => {
  assert.deepEqual(resolveReturn("/jobs?tab=others&op=3"), { to: "/jobs?tab=others&op=3", label: "Job Recommendations" });
  assert.deepEqual(resolveReturn("/jobs"), { to: "/jobs", label: "Job Recommendations" });
  assert.deepEqual(resolveReturn("/tracker?status=Archived&sort=company&dir=asc&q=acme&page=2"), {
    to: "/tracker?status=Archived&sort=company&dir=asc&q=acme&page=2",
    label: "Application Tracker",
  });
  assert.deepEqual(resolveReturn("/saved?page=2"), { to: "/saved?page=2", label: "Saved Jobs" });
});

test("scroll and open groups are restored by back, forward and reload, or a return link; not by an ordinary visit", () => {
  assert.equal(shouldRestore("POP", null), true);
  assert.equal(shouldRestore("PUSH", { restoreView: true }), true);
  assert.equal(shouldRestore("REPLACE", { restoreView: true }), true);
  assert.equal(shouldRestore("PUSH", null), false);
  assert.equal(shouldRestore("PUSH", {}), false);
});

test("query values: pages, choices and defaults left out of the URL", () => {
  assert.equal(parsePage("3"), 3);
  for (const bad of [undefined, null, "", "0", "-2", "abc", "1.5x"]) assert.equal(parsePage(bad), 1, String(bad));
  assert.equal(parseChoice("Archived", ["All status", "Archived"], "All status"), "Archived");
  assert.equal(parseChoice("<script>", ["All status", "Archived"], "All status"), "All status");
  assert.equal(parseChoice(null, ["a"], "a"), "a");

  const defaults = { tab: "watchlist", wp: 1, op: 1 };
  assert.equal(withParams("", { tab: "others", op: 2 }, defaults).toString(), "tab=others&op=2");
  // Back to the defaults: the keys go, so the default view has a clean URL.
  assert.equal(withParams("tab=others&op=2", { tab: "watchlist", op: 1 }, defaults).toString(), "");
  assert.equal(withParams("tab=others&wp=3", { op: 2 }, defaults).toString(), "tab=others&wp=3&op=2");
  assert.equal(withParams("q=acme", { q: "" }, { q: "" }).toString(), "");
});

test("the remembered view round-trips, keeps the last list, and survives broken storage", () => {
  globalThis.sessionStorage = fakeStorage();
  assert.equal(lastListUrl(), null);
  assert.equal(readView("/jobs"), null);
  rememberList("/jobs?tab=others&op=2");
  patchView("/jobs?tab=others&op=2", { scrollY: 640 });
  patchView("/jobs?tab=others&op=2", { expanded: ["northwind.example"] });
  assert.equal(lastListUrl(), "/jobs?tab=others&op=2");
  assert.deepEqual(readView("/jobs?tab=others&op=2"), { scrollY: 640, expanded: ["northwind.example"] });
  // Another list's record does not touch it.
  patchView("/saved", { scrollY: 10 });
  assert.deepEqual(readView("/jobs?tab=others&op=2"), { scrollY: 640, expanded: ["northwind.example"] });
  assert.equal(lastListUrl(), "/jobs?tab=others&op=2");

  // Junk in storage reads as nothing.
  globalThis.sessionStorage = { getItem: () => "{not json", setItem: () => {} };
  assert.equal(lastListUrl(), null);
  assert.equal(readView("/jobs"), null);
  // Storage that throws never breaks the page.
  globalThis.sessionStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(lastListUrl(), null);
  assert.doesNotThrow(() => rememberList("/jobs"));
  assert.doesNotThrow(() => patchView("/jobs", { scrollY: 5 }));
  delete globalThis.sessionStorage;
  assert.equal(lastListUrl(), null);
});

test("a stored record is capped so it cannot grow without end", () => {
  globalThis.sessionStorage = fakeStorage();
  for (let i = 0; i < 100; i += 1) patchView(`/tracker?q=${i}`, { scrollY: i });
  assert.equal(readView("/tracker?q=0"), null);
  assert.deepEqual(readView("/tracker?q=99"), { scrollY: 99, expanded: [] });
  delete globalThis.sessionStorage;
});

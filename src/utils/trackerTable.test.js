// Run with: node --test src/utils/trackerTable.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, formatTableDate, matchesSearch, nextSort, pageSlice, salaryValue, sortRows, startOfWeek } from "./trackerTable.js";

const app = (status, extra = {}) => ({ jobId: `${status}-${Math.random()}`, status, archived: false, appliedAt: null, ...extra });

test("stats: total counts applied and later, pending not, archived yes", () => {
  const stats = computeStats([app("pending"), app("applied"), app("interviewing", { archived: true }), app("offer"), app("not_moving_forward")]);
  assert.equal(stats.total, 4);
});

test("stats: actively interviewing excludes archived", () => {
  const stats = computeStats([app("interviewing"), app("interviewing", { archived: true }), app("applied")]);
  assert.equal(stats.interviewing, 1);
});

test("stats: response rate is a whole-number percent, 0 with nothing applied", () => {
  assert.equal(computeStats([]).responseRate, 0);
  assert.equal(computeStats([app("pending")]).responseRate, 0);
  // 1 responded of 3 applied-or-later = 33%
  assert.equal(computeStats([app("applied"), app("applied"), app("interviewing")]).responseRate, 33);
  // 2 of 3 = 67%
  assert.equal(computeStats([app("applied"), app("offer"), app("not_moving_forward")]).responseRate, 67);
});

test("stats: this week starts Monday 00:00 local time", () => {
  const wednesday = new Date(2026, 9, 14, 15, 30); // Oct 14 2026
  const monday = startOfWeek(wednesday);
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getHours(), 0);
  assert.equal(monday.getDate(), 12);
  const sunday = startOfWeek(new Date(2026, 9, 18, 9, 0));
  assert.equal(sunday.getDate(), 12);

  const on = new Date(2026, 9, 12, 0, 0).toISOString();
  const before = new Date(2026, 9, 11, 23, 59).toISOString();
  const stats = computeStats([app("applied", { appliedAt: on }), app("applied", { appliedAt: before }), app("pending")], wednesday);
  assert.equal(stats.thisWeek, 1);
});

test("dates show as MM/DD/YYYY, a missing date as a dash", () => {
  assert.equal(formatTableDate(new Date(2026, 9, 12, 12).toISOString()), "10/12/2026");
  assert.equal(formatTableDate(null), "-");
  assert.equal(formatTableDate("nonsense"), "-");
});

test("salary: low end of the range, hourly scaled, nothing for a dash", () => {
  assert.equal(salaryValue("$160k - $210k"), 160000);
  assert.equal(salaryValue("$40 - $55/hr"), 40 * 2080);
  assert.equal(salaryValue(null), null);
  assert.equal(salaryValue("-"), null);
});

test("search matches company or title, ignoring case and spaces around the query", () => {
  const row = { company: { name: "Northwind" }, title: "Senior Product Designer" };
  assert.equal(matchesSearch(row, "  NORTHWIND "), true);
  assert.equal(matchesSearch(row, "product des"), true);
  assert.equal(matchesSearch(row, "brightwave"), false);
  assert.equal(matchesSearch(row, ""), true);
});

test("sort: direction applies, missing values stay last either way", () => {
  const rows = [{ v: 2 }, { v: null }, { v: 5 }, { v: 1 }];
  const getters = { v: (r) => r.v };
  assert.deepEqual(sortRows(rows, { key: "v", direction: "asc" }, getters).map((r) => r.v), [1, 2, 5, null]);
  assert.deepEqual(sortRows(rows, { key: "v", direction: "desc" }, getters).map((r) => r.v), [5, 2, 1, null]);
  const names = [{ n: "banana" }, { n: "Apple" }, { n: "cherry" }];
  assert.deepEqual(sortRows(names, { key: "n", direction: "asc" }, { n: (r) => r.n }).map((r) => r.n), ["Apple", "banana", "cherry"]);
});

test("a header click flips the same column and starts a new one ascending", () => {
  assert.deepEqual(nextSort({ key: "a", direction: "asc" }, "a"), { key: "a", direction: "desc" });
  assert.deepEqual(nextSort({ key: "a", direction: "desc" }, "b"), { key: "b", direction: "asc" });
});

test("pages hold 12 rows", () => {
  const rows = Array.from({ length: 30 }, (_, i) => i);
  assert.equal(pageSlice(rows, 1).length, 12);
  assert.equal(pageSlice(rows, 3).length, 6);
});

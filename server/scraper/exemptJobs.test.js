// Run with: node --test server/scraper/exemptJobs.test.js
// Saved jobs and jobs with an application record (any status, pending included) are exempt from the
// Others filters, the 60-day hiding rule and every purge. No network and no model calls: the pure
// scrape steps run on fixture jobs against a temp data folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-exempt-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
const readData = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf-8"));

const { getExemptJobIds } = await import("../store/store.js");
const { applyOthersFilters, purgeRemovedWatchlistJobs, purgeStaleOthersJobs } = await import("./fetchJobs.js");
const { filterJobs } = await import("./filterJobs.js");

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
const job = (id, extra = {}) => ({
  id,
  company: { id: "others:beta", name: "Beta", domain: "beta.test" },
  title: "Product Designer",
  location: "New York, NY",
  workMode: "hybrid",
  postedAt: iso(1),
  firstSeenAt: iso(1),
  closed: false,
  ...extra,
});
const stale = (id) => job(id, { postedAt: iso(100), firstSeenAt: iso(100) });
const abroad = (id) => job(id, { location: "Berlin, Germany" });

function seed({ saved = [], applications = {}, watchlist = [], jobs = [] } = {}) {
  writeData("store.json", {
    schemaVersion: 1,
    watchlist,
    companyMeta: {},
    profile: null,
    userState: { savedJobIds: saved, dismissedJobIds: [], lastViewed: { watchlist: null } },
    meta: { lastScrapeAt: null },
  });
  writeData("applications.json", { schemaVersion: 1, applications });
  writeData("jobs.json", { schemaVersion: 1, jobs });
}
const record = (jobId, status) => ({ jobId, status, archived: false, statusHistory: [], createdAt: iso(0), job: {} });

test("exempt ids are saved jobs plus every application record, any status", () => {
  seed({
    saved: ["s1"],
    applications: { p1: record("p1", "pending"), a1: record("a1", "applied"), o1: record("o1", "offer") },
  });
  assert.deepEqual([...getExemptJobIds()].sort(), ["a1", "o1", "p1", "s1"]);
});

test("Others scrape: stale and non-US jobs are dropped unless exempt", () => {
  const normalizedJobs = [job("fresh"), stale("stale-plain"), stale("stale-pending"), abroad("abroad-applied"), stale("stale-saved")];
  const out = applyOthersFilters({
    normalizedJobs,
    existingForCompany: [],
    exemptSet: new Set(["stale-pending", "abroad-applied", "stale-saved"]),
    nowMs: NOW,
  });
  assert.deepEqual(out.map((j) => j.id).sort(), ["abroad-applied", "fresh", "stale-pending", "stale-saved"]);
  // Still in the feed: kept at its live data, not marked closed.
  assert.equal(out.find((j) => j.id === "stale-pending").closed, false);
});

test("Others scrape: an exempt job missing from a successful fetch is carried forward, marked closed", () => {
  const existing = job("gone-pending");
  const out = applyOthersFilters({
    normalizedJobs: [job("fresh")],
    existingForCompany: [existing, job("gone-plain")],
    exemptSet: new Set(["gone-pending"]),
    nowMs: NOW,
  });
  assert.deepEqual(out.map((j) => j.id).sort(), ["fresh", "gone-pending"]);
  assert.equal(out.find((j) => j.id === "gone-pending").closed, true);
  assert.equal(out.find((j) => j.id === "gone-pending").title, "Product Designer");
});

test("a record created mid-run is read fresh, so its job is kept", () => {
  seed();
  const before = getExemptJobIds();
  assert.equal(before.has("late"), false);
  // The person applies while the scrape is running: the next read sees it.
  writeData("applications.json", { schemaVersion: 1, applications: { late: record("late", "pending") } });
  const out = applyOthersFilters({ normalizedJobs: [stale("late")], existingForCompany: [], exemptSet: getExemptJobIds(), nowMs: NOW });
  assert.deepEqual(out.map((j) => j.id), ["late"]);
});

test("60-day hiding rule: exempt jobs stay in the prefilter's fresh set", () => {
  const jobs = [job("new"), stale("old"), stale("old-pending")];
  const result = filterJobs({ jobs, profile: { roles: ["Product Designer"], locations: [] }, savedJobIds: ["old-pending"], now: NOW });
  assert.deepEqual(result.hiddenByFreshness.map((j) => j.id), ["old"]);
});

test("a company leaving the watchlist keeps saved and applied-to jobs, never others", () => {
  const w = (id, extra) => job(id, { company: { id: "c-gone", name: "Gone", domain: "gone.test" }, ...extra });
  seed({
    saved: ["w-saved"],
    applications: { "w-pending": record("w-pending", "pending"), "w-applied": record("w-applied", "applied") },
    watchlist: [{ id: "c-kept", name: "Kept", domain: "kept.test" }],
    jobs: [w("w-saved"), w("w-pending"), w("w-applied"), w("w-plain"), job("o-1")],
  });
  const removed = purgeRemovedWatchlistJobs();
  assert.equal(removed, 1);
  assert.deepEqual(readData("jobs.json").jobs.map((j) => j.id).sort(), ["o-1", "w-applied", "w-pending", "w-saved"]);
});

test("Others companies dropping out of the config keep exempt jobs", () => {
  const o = (id) => job(id, { company: { id: "others:old", name: "Old", domain: "old.test" } });
  seed({
    applications: { "o-pending": record("o-pending", "pending") },
    jobs: [o("o-pending"), o("o-plain"), job("kept")],
  });
  purgeStaleOthersJobs(new Set(["others:beta"]));
  assert.deepEqual(readData("jobs.json").jobs.map((j) => j.id).sort(), ["kept", "o-pending"]);
});

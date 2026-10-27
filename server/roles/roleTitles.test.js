// Run with: node --test server/roles/roleTitles.test.js
// Designation suggestions: the normalizer, the two-company rule, merge order, dedupe, the
// empty-jobs fallback, and the committed snapshot. No network, no AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-roles-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
// Imported after the data folder is set: filterJobs.js pulls in the store.
const { normalizeTitle, rankTitles, mergeSuggestions } = await import("./roleTitles.js");
const { mentionsCompany, buildSnapshot } = await import("./buildRoleTitles.js");

const job = (company, title, extra = {}) => ({ id: `${company}:${title}`, company: { id: company, name: company }, title, ...extra });

test("normalizer: level words, cut points, whitespace", () => {
  assert.equal(normalizeTitle("Senior Product Designer II, Growth").display, "Product Designer");
  assert.equal(normalizeTitle("Staff  Software   Engineer - Payments").display, "Software Engineer");
  assert.equal(normalizeTitle("Product Designer | Remote").display, "Product Designer");
  assert.equal(normalizeTitle("UX Designer (Contract)").display, "UX Designer");
  assert.equal(normalizeTitle("Data Scientist @ Acme").display, "Data Scientist");
  assert.equal(normalizeTitle("Forward Deployed Engineer -Spark").display, "Forward Deployed Engineer");
  assert.equal(normalizeTitle("Senior/Staff Backend Engineer").display, "Backend Engineer");
  assert.equal(normalizeTitle("SOFTWARE ENGINEER").display, "Software Engineer");
  assert.equal(normalizeTitle("Member of Technical Staff").display, "Member of Technical Staff");
});

test("normalizer: the key is the prefilter's comparison form (levels dropped, UX/UI = UI/UX)", () => {
  assert.equal(normalizeTitle("Sr. Product Designer III").key, "product designer");
  assert.equal(normalizeTitle("UX/UI Designer").key, normalizeTitle("UI/UX Designer").key);
});

test("normalizer drops what is not a usable suggestion", () => {
  for (const bad of [
    "Software Engineer 2024-123", // digits / job code
    "L5 Software Engineer",
    "AB", // under 3 characters
    "Senior", // nothing left after the level word
    "Chief Product Officer Of The Whole Big Company Group", // executive, and over 6 words
    "Director of Design", // the prefilter hides executive titles
    "Design Intern", // and junior ones
    "Manager/ Manager",
    "Manager", // one word: as a chip it would match every title containing it
    "Senior Designer II, Growth", // "Designer" once the level words and the tail are gone
    "",
    null,
  ]) {
    assert.equal(normalizeTitle(bad), null, String(bad));
  }
  assert.equal(normalizeTitle("Senior Customer Success Operations Program Manager Of Things")?.display ?? null, null, "over 6 words");
});

test("live tier: a title needs two distinct companies, ranked by job count", () => {
  const jobs = [
    job("a", "Product Designer"), job("a", "Senior Product Designer"), job("a", "Product Designer II"),
    job("b", "Product Designer"),
    job("a", "Brand Wizard"), job("a", "Brand Wizard"), // one company only: not suggested
    job("a", "Data Scientist"), job("b", "Data Scientist, ML"),
    job("c", "Data Scientist"), job("c", "Product Designer - Growth"),
    job("c", "Closed Role", { closed: true }), job("d", "Closed Role"),
  ];
  const ranked = rankTitles(jobs);
  assert.deepEqual(ranked.map((r) => r.title), ["Product Designer", "Data Scientist"]);
  assert.deepEqual(ranked.map((r) => r.companies), [3, 3]);
  assert.deepEqual(rankTitles([job("a", "Analyst"), job("a", "Analyst")]), [], "one company never qualifies");
  assert.deepEqual(rankTitles([]), []);
});

test("merge: live before snapshot, deduped case-insensitively, capped", () => {
  const live = ["Product Designer", "Data Scientist"];
  const snapshot = ["product designer", "Software Engineer", "Data scientist", "Account Executive"];
  const merged = mergeSuggestions({ live, snapshot });
  assert.deepEqual(merged.map((s) => s.title), ["Product Designer", "Data Scientist", "Software Engineer", "Account Executive"]);
  assert.deepEqual(merged.map((s) => s.source), ["live", "live", "snapshot", "snapshot"]);
  const many = Array.from({ length: 30 }, (_, i) => `Role ${String.fromCharCode(65 + i)}x`);
  assert.equal(mergeSuggestions({ live: [], snapshot: many }).length, 10);
});

test("two-word minimum applies to both tiers", () => {
  assert.equal(normalizeTitle("Senior Designer"), null, "Designer alone");
  assert.equal(normalizeTitle("UX Designer").display, "UX Designer");
  const jobs = Array.from({ length: 6 }, (_, i) => job(i % 2 ? "a" : "b", "Senior Manager"));
  assert.deepEqual(rankTitles(jobs), [], "a one-word title is not admitted even with many jobs at many companies");
  assert.ok(SNAPSHOT.titles.every((t) => t.includes(" ")), "no one-word title in the snapshot");
});

test("a title at one company is admitted with five or more jobs, not with four", () => {
  const five = Array.from({ length: 5 }, () => job("bigco", "UX Designer"));
  assert.deepEqual(rankTitles(five).map((r) => [r.title, r.jobs, r.companies]), [["UX Designer", 5, 1]]);
  assert.deepEqual(rankTitles(five.slice(0, 4)), []);
  // Two companies still admit a small title.
  assert.deepEqual(rankTitles([job("a", "UX Researcher"), job("b", "UX Researcher")]).map((r) => r.title), ["UX Researcher"]);
});

test("typed text matches at the start of any word, never mid-word", () => {
  const snapshot = ["Product Designer", "Redesign Lead", "Designated Support Engineer", "Interaction Design Lead", "UX Researcher"];
  const titles = (q) => mergeSuggestions({ snapshot, query: q }).map((s) => s.title);
  assert.deepEqual(titles("design"), ["Product Designer", "Designated Support Engineer", "Interaction Design Lead"], "Redesign is mid-word");
  assert.deepEqual(titles("ux"), ["UX Researcher"]);
  assert.deepEqual(titles("prod des"), ["Product Designer"], "a multi-word start works");
  assert.deepEqual(titles("zzz"), []);
  assert.deepEqual(titles("."), [], "regex characters are literal");
});

test("with typed text: ranked by job count, live before snapshot; first-word match only breaks ties", () => {
  const live = [
    { title: "Design Systems Lead", jobs: 3 },
    { title: "Product Designer", jobs: 9 },
    { title: "Designer Advocate", jobs: 3 },
    { title: "Brand Designer", jobs: 3 },
  ];
  const snapshot = ["Industrial Designer", "Design Engineer", "Product Designer"];
  const out = mergeSuggestions({ live, snapshot, query: "design" });
  assert.deepEqual(
    out.map((s) => s.title),
    ["Product Designer", "Design Systems Lead", "Designer Advocate", "Brand Designer", "Industrial Designer", "Design Engineer"],
    "9 jobs first; the 3-job tie puts first-word matches (in their own order) before Brand Designer; then the snapshot in rank order"
  );
  assert.deepEqual(out.map((s) => s.source), ["live", "live", "live", "live", "snapshot", "snapshot"]);
  assert.equal(mergeSuggestions({ live, snapshot, query: "design", limit: 2 }).length, 2);
});

test("empty jobs.json falls back to the snapshot only (through the endpoint)", async () => {
  fs.writeFileSync(path.join(dataDir, "jobs.json"), JSON.stringify({ jobs: [] }));
  const { default: router } = await import("../routes/roleSuggestions.js");
  const app = express();
  app.use("/api/roles", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/roles/suggestions`;
    const all = (await (await fetch(base)).json()).suggestions;
    assert.equal(all.length, 10);
    assert.ok(all.every((s) => s.source === "snapshot"));
    const typed = (await (await fetch(`${base}?q=designer`)).json()).suggestions;
    assert.ok(typed.length > 0 && typed.every((s) => s.title.toLowerCase().includes("designer")));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

const SNAPSHOT = JSON.parse(fs.readFileSync(new URL("./roleTitles.json", import.meta.url), "utf8"));

test("the committed snapshot: titles only, no digits, no company names", () => {
  assert.deepEqual(Object.keys(SNAPSHOT).sort(), ["generatedAt", "titles"], "no counts, no companies, no text");
  assert.ok(SNAPSHOT.titles.length > 100 && SNAPSHOT.titles.length <= 300);
  assert.equal(new Set(SNAPSHOT.titles.map((t) => t.toLowerCase())).size, SNAPSHOT.titles.length, "no duplicates");
  for (const title of SNAPSHOT.titles) {
    assert.ok(!/\d/.test(title), `digit in ${title}`);
    assert.ok(title.length >= 3 && title.split(" ").length <= 6, title);
    assert.equal(normalizeTitle(title)?.display, title, `${title} is already normalized`);
  }
  // Company names: the curated Others boards (committed), plus this machine's scraped companies when present.
  const names = JSON.parse(fs.readFileSync(new URL("../scraper/othersCompanies.json", import.meta.url), "utf8")).map((c) => c.name);
  const jobsPath = new URL("../../data/jobs.json", import.meta.url);
  if (fs.existsSync(jobsPath)) {
    const raw = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
    for (const j of Array.isArray(raw) ? raw : raw.jobs ?? []) if (j.company?.name) names.push(j.company.name);
  }
  const hits = SNAPSHOT.titles.filter((t) => mentionsCompany(t, [...new Set(names)]));
  assert.deepEqual(hits, [], "a snapshot title mentions a company");
});

test("the build guard drops a title that names a company", () => {
  const jobs = [
    job("Okta", "Okta Account Executive"), job("Stripe", "Okta Account Executive"),
    job("Okta", "Account Executive"), job("Stripe", "Account Executive"),
  ];
  const { titles, dropped } = buildSnapshot(jobs);
  assert.deepEqual(titles, ["Account Executive"]);
  assert.deepEqual(dropped, ["Okta Account Executive"]);
});

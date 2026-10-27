// Builds server/roles/roleTitles.json, the bundled snapshot of generic posting titles behind
// GET /api/roles/suggestions: what a first-time user sees before anything of theirs is scraped.
// Run with `npm run build:roles` (reads data/jobs.json). The output is committed, so the app and
// forks never need to run this; re-run it to refresh the list after a fresh scrape.
//
// Same normalizer as the live tier (roleTitles.js), same rule (2+ companies or 5+ jobs), top 300 by frequency.
// The file holds titles only, in rank order: no company names, no posting text, no counts. As a
// second guard, any title containing a company's name (full name as a phrase, or its first word when
// that is 4+ letters) is dropped, and the dropped titles are printed for review.
// The snapshot leans toward tech roles because the jobs come from the curated company boards.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rankTitles } from "./roleTitles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "roleTitles.json");
const JOBS_PATH = path.join(__dirname, "..", "..", "data", "jobs.json");
export const SNAPSHOT_SIZE = 300;

const words = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** True when a title contains a company's name (full name as a phrase, or a first word of 4+ letters). */
export function mentionsCompany(title, companyNames) {
  const padded = ` ${words(title)} `;
  return companyNames.some((name) => {
    const full = words(name);
    if (!full) return false;
    if (padded.includes(` ${full} `)) return true;
    const first = full.split(" ")[0];
    return first.length >= 4 && padded.includes(` ${first} `);
  });
}

export function buildSnapshot(jobs) {
  const companyNames = [...new Set(jobs.map((j) => j.company?.name).filter(Boolean))];
  const ranked = rankTitles(jobs);
  const dropped = [];
  const titles = [];
  for (const { title } of ranked) {
    if (mentionsCompany(title, companyNames)) dropped.push(title);
    else if (titles.length < SNAPSHOT_SIZE) titles.push(title);
  }
  // Kept only by the five-job rule (one company), for review.
  const byJobCount = ranked.filter((r) => r.companies < 2 && titles.includes(r.title)).map((r) => `${r.title} (${r.jobs} jobs)`);
  return { titles, dropped, byJobCount };
}

function run() {
  if (!fs.existsSync(JOBS_PATH)) {
    console.log("No data/jobs.json yet, so there is nothing to build from. Run `npm run fetch:jobs` first. The committed snapshot (server/roles/roleTitles.json) is unchanged.");
    return;
  }
  const raw = JSON.parse(fs.readFileSync(JOBS_PATH, "utf8"));
  const jobs = Array.isArray(raw) ? raw : raw.jobs ?? [];
  const { titles, dropped, byJobCount } = buildSnapshot(jobs);
  const out = { generatedAt: new Date().toISOString().slice(0, 10), titles };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${titles.length} titles to ${path.relative(process.cwd(), OUT_PATH)} from ${jobs.length} jobs.`);
  if (byJobCount.length) console.log(`Admitted by the five-job rule only (${byJobCount.length}): ${byJobCount.join(' | ')}`);
  if (dropped.length) console.log(`Dropped for mentioning a company (${dropped.length}): ${dropped.join(" | ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();

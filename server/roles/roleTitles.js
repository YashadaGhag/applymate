import { matchesWordStarts, typedTokens } from "../../shared/wordStartMatch.js";
import { SENIORITY_WORDS, titleWords, withoutSeniority, seniorityMismatch } from "../scraper/filterJobs.js";

// Designation suggestions for the Role page and Change Preferences > Details. A suggestion has to
// match what the prefilter would match, so the title rules here are the prefilter's own (imported
// from filterJobs.js, not copied):
//   - SENIORITY_WORDS: the level words the title check ignores (senior, sr, junior, jr, staff, lead,
//     principal, associate, mid, level, entry, i to v, 1 to 5). They are dropped from a suggestion.
//   - titleWords: lowercase words with punctuation dropped, and "UX/UI" = "UI/UX". The dedupe key
//     is these words minus the level words, exactly what titleMatchesAnyRole compares.
//   - seniorityMismatch: titles the prefilter hides anyway (intern, entry-level, new grad, junior;
//     vice president, vp, director, head of, chief, president) are never suggested.
// On top of that, a suggestion is cut at the first comma, " - " (also a dash with a space on one side, "Engineer -Spark" or "Engineer– Cortex"), "|", "(" or " @ ", whitespace is
// collapsed, and titles with digits or job codes, under 3 characters, under 2 or over 6 words are dropped.

const CUT = /,|\s[-–—]|[–—]\s|\||\(|\s@\s/;
const MIN_LENGTH = 3;
const MIN_WORDS = 2; // a one-word chip ("Manager") would match every title containing it
const MAX_WORDS = 6;
// Words the prefilter treats as a level, but which are part of a real title here.
const PROTECTED = [/\btechnical staff\b/i];

function tidyCase(text) {
  // "SOFTWARE ENGINEER" -> "Software Engineer"; mixed case ("UX Designer", "iOS Engineer") stays.
  if (text !== text.toUpperCase() || text.length <= 4) return text;
  return text.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * One posting title -> { display, key } or null when it should not be suggested.
 * `display` is what the person sees ("Product Designer"), `key` is the prefilter's comparison form.
 */
export function normalizeTitle(raw) {
  if (typeof raw !== "string") return null;
  const cut = raw.split(CUT)[0].replace(/\s+/g, " ").trim();
  if (!cut || seniorityMismatch(cut)) return null;

  const protectedTokens = new Set(
    PROTECTED.flatMap((re) => (cut.match(re) ?? []).flatMap((span) => span.toLowerCase().split(" ")))
  );
  const display = cut
    .split(" ")
    .filter((token) => {
      if (protectedTokens.has(token.toLowerCase())) return true;
      // "Senior/Staff" is two level words joined by a slash.
      const parts = token.toLowerCase().split("/").map((w) => w.replace(/[^a-z0-9]+/g, ""));
      return !parts.every((w) => w && SENIORITY_WORDS.has(w));
    })
    .join(" ")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+#.)]+$/g, "")
    .trim();

  if (display.length < MIN_LENGTH) return null;
  if (/\d/.test(display)) return null;
  if (/\/\s|\s\//.test(display)) return null; // "Manager/ Manager": a posting listing alternatives
  const wordCount = display.split(" ").length;
  if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) return null;
  const key = withoutSeniority(titleWords(display)).join(" ");
  if (!key || key.length < MIN_LENGTH) return null;
  return { display: tidyCase(display), key };
}

/** The company a job belongs to, for the two-company rule. */
function companyOf(job) {
  return job.companyId ?? job.company?.id ?? job.company?.domain ?? job.company?.name ?? null;
}

/**
 * Titles worth suggesting from a list of jobs: kept when they appear at `minCompanies` or more
 * distinct companies (so a company-specific title does not leak in) or in `minJobs` or more jobs (a
 * real role one big employer hires for, like UX Designer at one large employer), ranked by job count, then
 * alphabetically. Closed jobs are ignored. Returns [{ title, jobs, companies }].
 */
export const MIN_COMPANIES = 2;
export const MIN_JOBS = 5;

export function rankTitles(jobs, { minCompanies = MIN_COMPANIES, minJobs = MIN_JOBS } = {}) {
  const groups = new Map();
  for (const job of jobs ?? []) {
    if (job.closed) continue;
    const company = companyOf(job);
    const norm = normalizeTitle(job.title);
    if (!norm || company == null) continue;
    const group = groups.get(norm.key) ?? { jobs: 0, companies: new Set(), displays: new Map() };
    group.jobs += 1;
    group.companies.add(company);
    group.displays.set(norm.display, (group.displays.get(norm.display) ?? 0) + 1);
    groups.set(norm.key, group);
  }
  return [...groups.values()]
    .filter((g) => g.companies.size >= minCompanies || g.jobs >= minJobs)
    .map((g) => ({
      title: [...g.displays.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      jobs: g.jobs,
      companies: g.companies.size,
    }))
    .sort((a, b) => b.jobs - a.jobs || a.title.localeCompare(b.title));
}

export const SUGGESTION_LIMIT = 10;


/**
 * Live titles first, then the snapshot, deduped case-insensitively. `live` items are titles or
 * { title, jobs }; `snapshot` items are titles in rank order.
 *
 * With typed text, a title matches when the text starts at the beginning of any of its words
 * ("design" matches "Product Designer" and "Design Systems", never "Redesign" or "Undesignated"; "prod
 * des" matches "Product Designer"). Matches are ranked by job count, the live tier first, then the
 * snapshot in its own rank order (it holds no counts). A title whose first word starts with the typed
 * text only wins a tie between live titles with the same job count. Capped at `limit`.
 * Returns [{ title, source: "live" | "snapshot" }].
 */
export function mergeSuggestions({ live = [], snapshot = [], query = "", limit = SUGGESTION_LIMIT }) {
  const tokens = typedTokens(query);
  const q = tokens.join(" ");
  const seen = new Set();
  const all = [];
  for (const [source, titles] of [["live", live], ["snapshot", snapshot]]) {
    for (const item of titles) {
      const title = typeof item === "string" ? item : item.title;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ title, source, jobs: typeof item === "string" ? 0 : item.jobs ?? 0, order: all.length });
    }
  }
  const strip = ({ title, source }) => ({ title, source });
  if (!q) return all.slice(0, limit).map(strip);

  const firstWordStart = (title) => title.toLowerCase().startsWith(q);
  const matches = all.filter((s) => matchesWordStarts(s.title, tokens));
  matches.sort((a, b) => {
    if (a.source !== b.source) return a.source === "live" ? -1 : 1;
    if (a.source === "live" && a.jobs !== b.jobs) return b.jobs - a.jobs;
    if (a.source === "live") {
      const byFirst = Number(firstWordStart(b.title)) - Number(firstWordStart(a.title));
      if (byFirst) return byFirst;
    }
    return a.order - b.order;
  });
  return matches.slice(0, limit).map(strip);
}

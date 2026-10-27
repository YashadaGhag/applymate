import { fileURLToPath } from "node:url";
import { getState, getJobsStore, getExemptJobIds } from "../store/store.js";
import { coordsForLocation, distanceMiles } from "../geo/cities.js";
import { parseJobLocation } from "./jobLocation.js";

const FRESHNESS_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

// A job location within this distance of any of the profile's locations counts as a match.
export const LOCATION_RADIUS_MILES = 40;

// Level words, ignored when comparing a title to the profile's role chips: "Senior Product
// Designer II" and "Product Designer" are the same role for matching. Clear level mismatches
// are a separate check below.
export const SENIORITY_WORDS = new Set([
  "senior", "sr", "junior", "jr", "staff", "lead", "principal", "associate", "mid", "level", "entry",
  "i", "ii", "iii", "iv", "v", "1", "2", "3", "4", "5",
]);

// "Clear" mismatches only, per instruction — things like "Staff", "Lead", "Principal", "Associate"
// are genuinely ambiguous (some orgs use them above senior, some at/below) and are deliberately
// left out: a too-strict filter silently hides good jobs, which is worse than a few weak ones through.
const JUNIOR_PATTERN = /\b(intern(ship)?|entry[- ]level|new[- ]grad(uate)?|graduate program|apprentice|trainee|junior)\b/i;
const EXEC_PATTERN = /\b(vice president|vp|director|head of|chief|president|cxo)\b/i;

// Lowercased words with punctuation dropped. "UX/UI" and "UI/UX" become one word so they
// compare equal; there's deliberately no other abbreviation handling.
export function titleWords(text) {
  return (text ?? "")
    .toLowerCase()
    .replace(/\b(ux\s*\/\s*ui|ui\s*\/\s*ux)\b/g, " uxui ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

export function withoutSeniority(words) {
  return words.filter((w) => !SENIORITY_WORDS.has(w));
}

function containsPhrase(words, phrase) {
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

// Driven only by the chips. A title passes when, with level words ignored, it contains one of the
// chips as a phrase ("Senior Product Designer II, Growth" has "product designer"), or it's a
// generic title made of nothing but the chips' core word (last word) and level words ("Senior
// Designer"), or that core word as a discipline plus "Lead" ("Design Lead", "Engineering Lead").
// A core word paired with another discipline ("Design Engineer", "Brand Designer") fails.
function titleMatchesAnyRole(title, roles) {
  if (!roles || roles.length === 0) return true; // no designation to check against — don't exclude on it
  const all = titleWords(title);
  const core = withoutSeniority(all);
  return roles.some((role) => {
    const phrase = withoutSeniority(titleWords(role));
    if (phrase.length === 0) return false;
    if (containsPhrase(core, phrase)) return true;
    const coreWord = phrase.at(-1);
    if (core.length === 1 && core[0] === coreWord) return true;
    // "Designer" → "Design Lead", "Researcher" → "Research Lead", "Engineer" → "Engineering Lead".
    const disciplineForms = [coreWord.replace(/(er|or)$/, ""), `${coreWord}ing`];
    return core.length === 1 && disciplineForms.includes(core[0]) && all.includes("lead");
  });
}

/**
 * Whether one designation chip appears in a title with level words ignored, the same phrase rule
 * the title check above uses ("Senior Product Designer II" contains "Product Designer"). Used by
 * the resume replacement's mismatch check to compare the profile's chips with a new resume.
 */
export function chipAppearsInTitle(chip, title) {
  const phrase = withoutSeniority(titleWords(chip));
  if (phrase.length === 0) return false;
  return containsPhrase(withoutSeniority(titleWords(title)), phrase);
}

export function seniorityMismatch(title) {
  if (JUNIOR_PATTERN.test(title)) return "junior";
  if (EXEC_PATTERN.test(title)) return "executive";
  return null;
}

// Everything the location check needs from the profile, worked out once per filterJobs call.
function locationContext(profile) {
  const locations = profile?.locations ?? [];
  return {
    relocation: profile?.relocation === "yes",
    hasLocations: locations.length > 0,
    points: locations.map(coordsForLocation).filter(Boolean),
  };
}

// An in-person piece (hybrid, on-site, or no stated mode) needs a place near the person, or a
// US place when they'll relocate ("yes" means within the US).
function judgeInPersonPlace(place, ctx) {
  if (!place) return "no location given";
  if (place.kind === "non-us") return "outside the US";
  if (place.kind === "unknown") return "not recognized as a US place";
  if (ctx.relocation || !ctx.hasLocations) return null;
  if (place.kind === "us" && place.coords) {
    const nearest = Math.min(...ctx.points.map((p) => distanceMiles(p, place.coords)));
    if (nearest <= LOCATION_RADIUS_MILES) return null;
    return Number.isFinite(nearest)
      ? `${Math.round(nearest)} mi from your nearest location, relocation: no`
      : "your locations can't be placed on the map, relocation: no";
  }
  // US, but no city we can measure from ("US", "California").
  return "unspecified US location, relocation: no";
}

// The work mode of one location piece: its own, else the job's, else null (unknown).
// "US" / "US, Canada" with no stated mode: the description only decides whether it's remote.
// Otherwise the mode stays unknown, and a US country passes wherever the person lives; a non-US
// one fails.
function pieceMode(piece, job) {
  const mode = piece.mode ?? job.workMode ?? null;
  if (piece.countryOnly && !mode && /\bremote\b/i.test(job.descriptionText ?? "")) return "remote";
  return mode;
}

// Returns null when the piece passes, or why it doesn't. The ticked work modes play no part here:
// a mode the person didn't tick only lowers the job's rank (hasWorkModeMismatch).
function judgePiece(piece, job, ctx) {
  const mode = pieceMode(piece, job);

  if (mode === "remote") {
    if (!piece.place || piece.place.kind === "us-unspecified" || piece.place.kind === "us") return null;
    return piece.place.kind === "non-us" ? "remote outside the US" : "remote, scoped to a region that isn't clearly the US";
  }
  if (piece.countryOnly) {
    return piece.place?.kind === "us-unspecified" ? null : "country only, outside the US";
  }
  return judgeInPersonPlace(piece.place, ctx);
}

// A job passes on location if any one of its locations passes.
function evaluateLocation(job, ctx) {
  const pieces = parseJobLocation(job.location);
  if (pieces.length === 0) {
    const problem = judgePiece({ text: "", mode: null, place: null, countryOnly: false }, job, ctx);
    return problem ? { pass: false, reason: `location: ${problem}` } : { pass: true };
  }
  const problems = [];
  for (const piece of pieces) {
    const problem = judgePiece(piece, job, ctx);
    if (!problem) return { pass: true };
    problems.push(`"${piece.text}": ${problem}`);
  }
  return { pass: false, reason: `location — ${problems.join("; ")}` };
}

export function isFresh(job, nowMs = Date.now()) {
  const anchor = job.postedAt ?? job.firstSeenAt;
  if (!anchor) return true; // nothing to measure against — don't hide on a guess
  const anchorMs = new Date(anchor).getTime();
  if (Number.isNaN(anchorMs)) return true;
  return nowMs - anchorMs <= FRESHNESS_WINDOW_MS;
}

// The single per-job prefilter decision. `ctx` is locationContext(profile); filterJobs passes it
// in so the profile's coordinates are looked up once per call rather than once per job.
export function evaluateJob(job, profile, ctx = locationContext(profile)) {
  const reasons = [];

  if (!titleMatchesAnyRole(job.title, profile?.roles)) {
    reasons.push(`title doesn't contain a role chip [${(profile?.roles ?? []).join(", ")}]`);
  }

  const seniority = seniorityMismatch(job.title);
  if (seniority === "junior") reasons.push("title reads as junior/entry-level");
  if (seniority === "executive") reasons.push("title reads as executive-level (VP/Director/Head of/Chief)");

  const location = evaluateLocation(job, ctx);
  if (!location.pass) reasons.push(location.reason);

  // Sponsorship never hides a job, whatever the profile's work authorization: a posting that says
  // it won't sponsor is only flagged (job.noSponsorship, set at scrape time).

  return { pass: reasons.length === 0, reasons };
}

// Main entry point — pure function, no I/O, so it can be called with any (jobs, profile) and
// inspected directly. Nothing here mutates storage: this computes a view over what's already
// stored, so re-running it after editing the profile re-filters the same underlying jobs.
export function filterJobs({ jobs, profile, savedJobIds = [], now = Date.now() }) {
  const savedSet = new Set(savedJobIds);

  const fresh = [];
  const hiddenByFreshness = [];
  for (const job of jobs) {
    if (savedSet.has(job.id) || isFresh(job, now)) fresh.push(job);
    else hiddenByFreshness.push(job);
  }

  const ctx = locationContext(profile);
  const passed = [];
  const rejected = [];
  for (const job of fresh) {
    const { pass, reasons } = evaluateJob(job, profile, ctx);
    if (pass) passed.push(job);
    else rejected.push({ job, reasons });
  }

  return { totalFetched: jobs.length, hiddenByFreshness, passed, rejected };
}

function groupByCompany(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const id = job.company?.id ?? "unknown";
    if (!groups.has(id)) groups.set(id, { name: job.company?.name ?? "Unknown", jobs: [] });
    groups.get(id).jobs.push(job);
  }
  return groups;
}

function run() {
  const state = getState();
  const { jobs } = getJobsStore();
  const profile = state.profile;
  const savedJobIds = [...getExemptJobIds(state)];

  const groups = groupByCompany(jobs);
  const perCompany = [];
  const allRejected = [];

  for (const { name, jobs: companyJobs } of groups.values()) {
    const result = filterJobs({ jobs: companyJobs, profile, savedJobIds });
    perCompany.push({
      company: name,
      fetched: result.totalFetched,
      afterFreshness: result.totalFetched - result.hiddenByFreshness.length,
      afterPrefilter: result.passed.length,
      hiddenByFreshness: result.hiddenByFreshness.length,
      rejectedByPrefilter: result.rejected.length,
    });
    for (const { job, reasons } of result.rejected) {
      allRejected.push({ company: name, title: job.title, reasons });
    }
  }

  console.log("=== per-company counts ===");
  console.log(JSON.stringify(perCompany, null, 2));
  console.log(`=== sample rejected titles (${Math.min(15, allRejected.length)} of ${allRejected.length}) ===`);
  console.log(JSON.stringify(allRejected.slice(0, 15), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}

/**
 * The job's locations (parsed pieces) that pass this profile's location check. Used to pick the
 * pay range that applies when a posting lists several by location.
 */
export function passingLocationPieces(job, profile) {
  const ctx = locationContext(profile);
  return parseJobLocation(job.location).filter((piece) => !judgePiece(piece, job, ctx));
}

/**
 * True when none of the job's modes is among the ticked work modes, so it ranks lower (a rank
 * penalty, never a filter). Missing data is never penalized: no ticked modes, or an unknown mode
 * on any location that passes, or any passing location in a ticked mode, all mean false. The
 * modes come from the locations that pass the location check, since those are the ones that
 * could be taken.
 */
export function hasWorkModeMismatch(job, profile) {
  const workTypes = profile?.workTypes;
  if (!workTypes || !Object.values(workTypes).some(Boolean)) return false;
  const ctx = locationContext(profile);
  const pieces = parseJobLocation(job.location);
  const candidates = pieces.length > 0 ? pieces : [{ text: "", mode: null, place: null, countryOnly: false }];
  const passing = candidates.filter((piece) => !judgePiece(piece, job, ctx));
  const modes = (passing.length > 0 ? passing : candidates).map((piece) => pieceMode(piece, job));
  return modes.every((mode) => mode && !workTypes[mode]);
}

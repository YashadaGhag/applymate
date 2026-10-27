import { Router } from "express";
import { getState, getJobsStore, getScoresStore, getResumesStore, getApplicationsStore, getExemptJobIds } from "../store/store.js";
import { appliedJobIds } from "../applications/status.js";
import { summarizeLocation } from "../scraper/locationSummary.js";
import { filterJobs, passingLocationPieces, hasWorkModeMismatch } from "../scraper/filterJobs.js";
import { statedCompensation, statedYearsOfExperience } from "../scraper/postingFacts.js";
import { parseJobLocation } from "../scraper/jobLocation.js";
import { matchBand, shownScore } from "../ai/matchBand.js";
import { loadOthersConfig, buildWatchlistDedupKeys, isOthersEntryOnWatchlist, normalizeDomain } from "../scraper/othersDedup.js";

const router = Router();

// Others shows only the best-scoring jobs, not the whole long tail.
const OTHERS_LIMIT = 30;
// A job that is flagged (won't sponsor, for a profile that needs it) or whose work mode isn't among
// the ticked ones ranks as if it scored this many points less. Both together still cost only this
// much, never double.
const RANK_PENALTY = 10;
// The Role page's "I require work sponsorship (Now or in the Future)" answers
// (WORK_AUTH_OPTIONS in src/pages/OnboardingRolePage.jsx). Empty means the question wasn't asked.
const SPONSORSHIP_WORK_AUTH = new Set([
  "F-1 (OPT/STEM OPT)",
  "H-1B (Transfer/Extension)",
  "TN/E-3/H-1B1",
  "Other Visa Sponsorship Needed",
]);

// ATS location strings sometimes carry stray separators ("-REMOTE, USA-", "Chicago, Seattle, ").
// Brackets and a final period are kept ("Seattle, WA (Hybrid)", "Washington D.C.").
export function cleanLocation(location) {
  if (typeof location !== "string") return location ?? null;
  return location.replace(/^[\s\-–—,;:./|•·*_]+/, "").replace(/[\s\-–—,;:/|•·*_]+$/, "") || null;
}

// What every job response adds on top of the stored job, worked out per request:
// - ai: the match score from data/scores.json (written only by the scoring run, never from a
//   route), and only when it was made for the current resume version and scores 50 or more;
//   otherwise null. band is "strong" (75+) or "moderate" (50-74), from the rounded score
//   (server/ai/matchBand.js); the band stored with the score is ignored.
// - statedCompensation / statedYearsOfExperience: read from the posting text in plain code
//   (postingFacts.js), kept apart from the structured `compensation` the ATS provides. Pay picks
//   the range for the job location that fits this profile when a posting lists several (for a
//   remote job, the person's own location). Null when the posting doesn't state it clearly.
// - noSponsorship: the posting says it won't sponsor a visa (set at scrape time).
// - flagNoSponsorship: noSponsorship, and the profile needs sponsorship. Only then is it shown
//   and used in ranking.
export function requestContext(state) {
  return {
    profile: state.profile,
    needsSponsorship: SPONSORSHIP_WORK_AUTH.has(state.profile?.workAuth),
    homePieces: (state.profile?.locations ?? []).flatMap((loc) => parseJobLocation(typeof loc === "string" ? loc : loc?.label)),
    scores: getScoresStore().scores,
    resumeVersion: getResumesStore().currentVersion,
  };
}

export function derivedFields(job, ctx) {
  const entry = ctx.scores[job.id];
  const current = entry && ctx.resumeVersion && entry.resumeVersion === ctx.resumeVersion;
  // Below 50 counts as unscored (matchBand returns null), so the job is never listed.
  const band = current ? matchBand(entry.score) : null;
  const flagNoSponsorship = Boolean(ctx.needsSponsorship && job.noSponsorship);
  return {
    ai: band
      ? { score: shownScore(entry.score), band, reasoning: entry.reasoning, highlights: entry.highlights ?? [] }
      : null,
    statedCompensation: statedCompensation(job.descriptionText, passingLocationPieces(job, ctx.profile), ctx.homePieces),
    statedYearsOfExperience: statedYearsOfExperience(job.descriptionText, job.title),
    noSponsorship: job.noSponsorship ?? null,
    flagNoSponsorship,
    // Ranking only, never shown: no tag or label. The real score is what's displayed.
    rankPenalty: flagNoSponsorship || hasWorkModeMismatch(job, ctx.profile) ? RANK_PENALTY : 0,
  };
}

// The list view never shows the full description, so it's dropped here along with the
// backend-only bookkeeping fields (closed — these are already filtered to open; isInitialScrape —
// only meaningful to the hasNewWatchlistJobs calculation below, done before this runs).
// The card's one-line location: a lead and how many more (see locationSummary.js). `location` stays
// the full text; `locations` is the deduplicated list for the hover label.
function locationFields(job, ctx) {
  const { all, lead, more } = summarizeLocation({ ...job, location: cleanLocation(job.location) }, ctx.profile);
  return { locationLead: lead, locationMore: more, locations: all };
}

function toListJob(job, ctx) {
  return {
    id: job.id,
    source: job.source,
    company: { name: job.company?.name, domain: job.company?.domain },
    title: job.title,
    location: cleanLocation(job.location),
    ...locationFields(job, ctx),
    workMode: job.workMode,
    postedAt: job.postedAt,
    postedAtKind: job.postedAtKind,
    firstSeenAt: job.firstSeenAt,
    applyUrl: job.applyUrl,
    compensation: job.compensation,
    ...derivedFields(job, ctx),
  };
}

function byNewestPosted(a, b) {
  const aTime = new Date(a.postedAt ?? a.firstSeenAt).getTime();
  const bTime = new Date(b.postedAt ?? b.firstSeenAt).getTime();
  return bTime - aTime;
}

// Highest score first. A penalized job is ranked as if it scored RANK_PENALTY less, and loses ties
// to unpenalized jobs, so it drops below them within that many points and no further. Newest first
// breaks any remaining tie.
function rankScore(job) {
  return job.ai.score - job.rankPenalty;
}

function byRank(a, b) {
  return (
    rankScore(b) - rankScore(a) ||
    Number(a.rankPenalty > 0) - Number(b.rankPenalty > 0) ||
    byNewestPosted(a, b)
  );
}

// Only scored jobs are listed; a job with no score for the current resume is hidden until the
// next scoring run, and one scoring below 50 (ai is null for it too) is hidden for good.
function scoredAndRanked(jobs, ctx) {
  return jobs
    .map((job) => ({ job, listJob: toListJob(job, ctx) }))
    .filter(({ listJob }) => listJob.ai)
    .sort((a, b) => byRank(a.listJob, b.listJob));
}

// The detail lookup is the only place a job's full description goes out —
// isInitialScrape is left off since it's backend-only bookkeeping, same as toListJob.
function toDetailJob(job, ctx) {
  return {
    id: job.id,
    source: job.source,
    company: { name: job.company?.name, domain: job.company?.domain },
    title: job.title,
    location: cleanLocation(job.location),
    workMode: job.workMode,
    postedAt: job.postedAt,
    postedAtKind: job.postedAtKind,
    firstSeenAt: job.firstSeenAt,
    applyUrl: job.applyUrl,
    compensation: job.compensation,
    descriptionText: job.descriptionText ?? "",
    descriptionHtml: job.descriptionHtml ?? "",
    closed: Boolean(job.closed),
    ...derivedFields(job, ctx),
  };
}

/**
 * GET /api/jobs
 * Returns { watchlistGroups, others, lastUpdatedAt, hasNewWatchlistJobs } — the same shape
 * useJobs() exposes to the page, minus `status`, which is a client-side fetch-lifecycle concern,
 * not something the server has an opinion on.
 *
 * Both tabs are filtered against the current profile on every request (filterJobs), so a profile
 * edit takes effect immediately. Only scored jobs are listed, ranked by score (byRank); Others is
 * capped at OTHERS_LIMIT. Dismissed jobs are left out of both tabs before that cap. Others never contributes to hasNewWatchlistJobs — that's a
 * Watchlist-only signal.
 */
router.get("/jobs", (req, res) => {
  const state = getState();
  const { jobs } = getJobsStore();
  const ctx = requestContext(state);
  const profile = state.profile;
  // Saved jobs and jobs with an application record skip the 60-day freshness rule (pending ones are
  // listed; applied-or-later ones are dropped just below).
  const savedJobIds = [...getExemptJobIds(state)];
  // Dismissed jobs are dropped before ranking, so they never take one of the Others top-30 spots.
  // Jobs the person has applied to (any status past pending) are dropped the same way. Pending
  // ones stay listed.
  const dismissed = new Set([
    ...(state.userState?.dismissedJobIds ?? []),
    ...appliedJobIds(getApplicationsStore().applications),
  ]);
  const lastViewedWatchlist = state.userState?.lastViewed?.watchlist ?? null;
  const dedupKeys = buildWatchlistDedupKeys(state);
  const othersConfigByDomain = new Map(loadOthersConfig().map((e) => [normalizeDomain(e.domain), e]));

  let hasNewWatchlistJobs = false;

  const watchlistGroups = state.watchlist.map((company) => {
    const companyBase = { name: company.name, domain: company.domain };
    const meta = state.companyMeta?.[company.id];

    // No confirmed ATS match (e.g. a company that runs its own in-house system) — still a group, not
    // silently dropped. There's no designed "Check careers page" treatment yet (not in Figma),
    // so this is the simplest visible state: an empty group the page can render a line of text for.
    if (!meta || meta.scrapeStatus !== "ok") {
      return { company: companyBase, location: null, jobs: [], noSource: true };
    }

    const openJobs = jobs.filter((j) => j.company?.id === company.id && !j.closed && !dismissed.has(j.id));
    const { passed } = filterJobs({ jobs: openJobs, profile, savedJobIds });
    const ranked = scoredAndRanked(passed, ctx);

    // Only listed (scored) jobs count, so the dot never points at a job the tab doesn't show.
    if (
      lastViewedWatchlist &&
      ranked.some(({ job }) => !job.isInitialScrape && new Date(job.firstSeenAt) > new Date(lastViewedWatchlist))
    ) {
      hasNewWatchlistJobs = true;
    }

    const groupJobs = ranked.map(({ listJob }) => listJob);
    return {
      company: companyBase,
      location: groupJobs[0]?.location ?? null,
      jobs: groupJobs,
      noSource: false,
    };
  });

  // Companies ordered by their best-ranked job; companies with nothing listed keep watchlist order
  // after them (the page sums those up in one help line rather than listing them).
  watchlistGroups.sort((a, b) => {
    if (a.jobs.length === 0 || b.jobs.length === 0) return Number(a.jobs.length === 0) - Number(b.jobs.length === 0);
    return byRank(a.jobs[0], b.jobs[0]);
  });

  // Scrape-time dedup (by ATS platform + slug, same as here) already drops an Others company once
  // it's added to the watchlist, but that only takes effect on the next scrape — this re-check
  // covers the window in between. A stored Others job doesn't carry its own platform/slug, so it's
  // looked up from the curated config by domain to run the same comparison.
  //
  // Others is stored broadly at scrape time (every fresh US / US-remote job) and filtered against
  // the current profile here, on every request, the same way Watchlist is — so a profile edit
  // shows up immediately instead of waiting for the next scrape.
  const othersCandidates = jobs.filter((j) => {
    if (!j.company?.id?.startsWith("others:") || j.closed || dismissed.has(j.id)) return false;
    const entry = othersConfigByDomain.get(normalizeDomain(j.company.domain));
    if (!entry) return true; // not found in the config (shouldn't normally happen) — don't hide it defensively
    return !isOthersEntryOnWatchlist(entry, dedupKeys);
  });
  const others = scoredAndRanked(filterJobs({ jobs: othersCandidates, profile, savedJobIds }).passed, ctx)
    .slice(0, OTHERS_LIMIT)
    .map(({ listJob }) => listJob);

  res.json({
    watchlistGroups,
    others,
    lastUpdatedAt: state.meta?.lastScrapeAt ?? null,
    hasNewWatchlistJobs,
  });
});

/**
 * GET /api/jobs/:id
 * The only route that returns a job's full description — closed jobs are still returned (with
 * closed: true) so a stale link shows "no longer accepting applications" instead of a blank 404;
 * only a truly unknown id 404s.
 */
router.get("/jobs/:id", (req, res) => {
  const { jobs } = getJobsStore();
  const job = jobs.find((j) => j.id === req.params.id);

  if (!job) {
    return res.status(404).json({ error: "not_found" });
  }

  res.json(toDetailJob(job, requestContext(getState())));
});

export default router;

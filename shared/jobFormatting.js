/**
 * Shared formatting helpers for job data (jobsFixtures.js / useJobs() / useJob()).
 * Kept framework-agnostic so both JobCard and JobDetailPage can format
 * the same underlying fields identically.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS =60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const pluralize = (n, word) => `${n} ${word}${n === 1 ? "" : "s"} ago`;

/**
 * "5 hours ago" / "2 days ago" / "1 week ago" relative to now. With `fine`, the first hour reads
 * "just now" (under a minute) or "N minutes ago", never "0 hours ago" (the "Updated …" header).
 */
export function relativeDuration(isoString, { fine = false } = {}) {
  const diffMs = Math.max(0, Date.now() - new Date(isoString).getTime());
  if (fine && diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS);
    return minutes < 1 ? "just now" : pluralize(minutes, "minute");
  }
  const hours = Math.round(diffMs / HOUR_MS);
  if (hours < 24) return pluralize(hours, "hour");
  const days = Math.round(diffMs / DAY_MS);
  if (days < 7) return pluralize(days, "day");
  const weeks = Math.round(diffMs / WEEK_MS);
  return pluralize(weeks, "week");
}

/**
 * Builds the "posted X ago" / "updated X ago" / "found X ago" label.
 * Falls back to firstSeenAt with "found" when postedAt is null.
 */
export function formatPostedLabel({ postedAt, postedAtKind, firstSeenAt }) {
  if (postedAt) return `${postedAtKind} ${relativeDuration(postedAt)}`;
  return `found ${relativeDuration(firstSeenAt)}`;
}

const CURRENCY_SYMBOLS = { USD: "$" };

/** "$160k - $210k" (or "$40 - $55/hr" for hourly pay), or null when compensation data isn't available. */
export function formatCompensation(compensation) {
  if (!compensation) return null;
  const { min, max, currency = "USD", period } = compensation;
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  if (period === "hourly") return `${symbol}${min} - ${symbol}${max}/hr`;
  const abbreviate = (n) => `${Math.round(n / 1000)}k`;
  return `${symbol}${abbreviate(min)} - ${symbol}${abbreviate(max)}`;
}

/**
 * The pay to show for a job: the ATS's structured range, else the range read from the posting
 * text. Both come from the posting itself, never an estimate.
 */
export function postingPayLabel(job) {
  return formatCompensation(job.compensation ?? job.statedCompensation);
}

/** "7+ years" / "3-5 years" from statedYearsOfExperience, or null. */
export function formatYearsOfExperience(years) {
  if (!years?.min) return null;
  return years.max ? `${years.min}-${years.max} years` : `${years.min}+ years`;
}

// Bands come from the server (server/ai/matchBand.js): 75+ strong, 50-74 moderate. Jobs below 50
// are never sent to the browser.
const BAND_LABELS = {
  strong: "Strong Match",
  moderate: "Moderate Match",
};

/** "Strong Match" / "Moderate Match" for a score band, or null for an unknown band. */
export function formatBand(band) {
  return BAND_LABELS[band] ?? null;
}

// Text color for a band label, matching the MatchScore ring (green for strong, yellow for moderate).
const BAND_TEXT_CLASSES = {
  strong: "text-success-500",
  moderate: "text-warning-700",
};

export function bandTextClass(band) {
  return BAND_TEXT_CLASSES[band] ?? "text-neutral-800";
}

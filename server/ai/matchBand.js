// The match band shown in the app, worked out at read time from the score the person sees (the
// rounded number), so a card showing 75% is always "Strong Match". The band stored in
// data/scores.json by older scoring runs (strong/qualified/stretch/weak) is ignored.
//
// Below MIN_SHOWN_SCORE a job is treated like an unscored one: not listed anywhere, and not
// counted in the Others top 30. Always judged on the real score, never the sponsorship-adjusted
// ranking score.
export const STRONG_MATCH_SCORE = 75;
export const MIN_SHOWN_SCORE = 50;

export function shownScore(score) {
  return Math.round(score);
}

/** "strong" (75+), "moderate" (50-74), or null when the job is hidden (below 50). */
export function matchBand(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const shown = shownScore(score);
  if (shown >= STRONG_MATCH_SCORE) return "strong";
  if (shown >= MIN_SHOWN_SCORE) return "moderate";
  return null;
}

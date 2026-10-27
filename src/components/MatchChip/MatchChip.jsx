import PropTypes from "prop-types";
// The server's bands (server/ai/matchBand.js): 75 and above is a strong match.
const STRONG_MATCH_SCORE = 75;

// Figma Table "Match": padding 4, radius 4, 12/16. Green (success) at 75 and above, yellow (warning)
// from 50 to 74, the same bands as the job cards. Moderate's text is warning-700, as in MatchScore:
// warning-500 text is too light to read at this size.
const BANDS = {
  strong: "bg-success-50 text-success-500",
  moderate: "bg-warning-50 text-warning-700",
};

/** The match score with a % sign in a coloured chip; a null score is a plain "-" with no chip. */
const MatchChip = ({ score, showLabel = false }) => {
  if (score == null) return <span className="text-body-medium text-neutral-500">-</span>;
  const band = score >= STRONG_MATCH_SCORE ? "strong" : "moderate";
  return <span className={`inline-flex rounded-xs p-sp4 text-body-small font-regular ${BANDS[band]}`}>{score}%{showLabel ? " match" : ""}</span>;
};

MatchChip.propTypes = {
  /** The rounded score, or null/undefined when there is none */
  score: PropTypes.number,
  /** Figma mobile cards read "96% match" */
  showLabel: PropTypes.bool,
};

export default MatchChip;

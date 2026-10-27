import PropTypes from "prop-types";

// Ring and number color per band. No band variants found in code; the Design System's "Match
// score" component set couldn't be inspected, so: success palette (green) for strong, warning
// palette (yellow) for moderate. Moderate's number uses warning-700 because warning-500 text is
// too light to read at this size; the ring keeps warning-500.
const BAND_STYLES = {
  strong: { ring: "stroke-success-500", text: "text-success-500" },
  moderate: { ring: "stroke-warning-500", text: "text-warning-700" },
};

const MatchScore = ({ percentage = 0, size = 40, band = "strong" }) => {
  const s = BAND_STYLES[band] ?? BAND_STYLES.strong;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-neutral-100"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={s.ring}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference - progress}`}
        />
      </svg>
      <span className={`absolute text-[10px] font-bold ${s.text}`}>
        {percentage}%
      </span>
    </div>
  );
};

MatchScore.propTypes = {
  percentage: PropTypes.number,
  size: PropTypes.number,
  /** Score band from the server: "strong" (75+, green) or "moderate" (50-74, yellow). */
  band: PropTypes.oneOf(["strong", "moderate"]),
};

export default MatchScore;

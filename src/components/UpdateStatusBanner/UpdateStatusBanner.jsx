import PropTypes from "prop-types";
import Banner from "../Banner/Banner";
import { ScoringSpinner } from "../ScoreNewResume";

// The daily background update's banners on Job Recommendations. Figma: running 2845:9862,
// failed 2846:13152 (the "New jobs added" toast, 2846:11354, is the shared success Toast).
// Compact banner like the Score new resume ones; neither has a button.
const COPY = {
  running: "Checking careers pages for new roles. This can take up to 5 minutes.",
  failed: "We couldn’t check for new roles. We’ll try again later.",
};

/** state: "running" (info, spinner) or "failed" (error). Renders nothing for any other state. */
const UpdateStatusBanner = ({ state, onDismiss, className }) => {
  const text = COPY[state];
  if (!text) return null;
  return (
    <Banner
      size="compact"
      variant={state === "running" ? "info" : "error"}
      icon={state === "running" ? ScoringSpinner : undefined}
      // Only the failed banner can be dismissed (Figma 2846:13152); the running one cannot.
      onClose={state === "failed" ? onDismiss : undefined}
      className={className}
    >
      {text}
    </Banner>
  );
};

UpdateStatusBanner.propTypes = {
  state: PropTypes.oneOf(["running", "failed"]),
  /** Failed only: the × button's handler. Without it there is no × */
  onDismiss: PropTypes.func,
  className: PropTypes.string,
};

export default UpdateStatusBanner;

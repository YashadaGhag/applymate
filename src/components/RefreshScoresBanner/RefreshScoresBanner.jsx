import PropTypes from "prop-types";
import Banner from "../Banner/Banner";
import Button from "../Button/Button";
import { ScoringSpinner } from "../ScoreNewResume";

// Job Recommendations: the banner shown after a Details edit left scores out of date (Figma "Job
// Recommendations - Refresh after edit - Banner"): the compact warning banner with a Refresh button
// and, as in the frame, no dismiss X (it stays until the person refreshes or scores are current). It
// sits in the same slot as the Score new resume banner. The running and failed variants are not in
// Figma: the running one reuses the compact info banner with the spinner, the failed one the error
// banner with Try again, like Score new resume.
const COPY = {
  ready: "You updated your details. Refresh to rescore your jobs against them.",
  running: "Refreshing your job scores against your updated details. This can take a couple of minutes.",
  failed: "We couldn’t finish refreshing your scores. Your earlier scores are still shown.",
};

const VARIANT = { ready: "warning", running: "info", failed: "error" };

/** state: "ready" (warning, Refresh), "running" (info, spinner) or "failed" (error, Try again). Nothing for any other state. */
const RefreshScoresBanner = ({ state, onRefresh, busy = false, className }) => {
  const text = COPY[state];
  if (!text) return null;
  const action =
    state === "running" ? null : (
      <Button variant="primary" onClick={onRefresh} disabled={busy}>
        {state === "failed" ? "Try again" : "Refresh"}
      </Button>
    );
  return (
    <Banner
      size="compact"
      variant={VARIANT[state]}
      icon={state === "running" ? ScoringSpinner : undefined}
      action={action}
      className={className}
    >
      {text}
    </Banner>
  );
};

RefreshScoresBanner.propTypes = {
  /** The state from GET /api/scoring/refresh */
  state: PropTypes.oneOf(["none", "ready", "running", "failed"]),
  /** Refresh (ready) and Try again (failed) */
  onRefresh: PropTypes.func,
  /** The start request is on its way: the button is disabled */
  busy: PropTypes.bool,
  className: PropTypes.string,
};

export default RefreshScoresBanner;

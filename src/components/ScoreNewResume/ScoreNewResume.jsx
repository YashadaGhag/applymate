import PropTypes from "prop-types";
import { LoaderCircle } from "lucide-react";
import Banner from "../Banner/Banner";
import Modal from "../Modal/Modal";
import Button from "../Button/Button";

// "Score new resume": the banners and dialogs shown while a new resume waits to be scored, is being
// scored, failed, or finished. Figma: Job Recommendations banners 2766:2299 (ready), 2770:7883
// (scoring), 2770:8447 (failed), 2770:8963 (done); dialogs 2765:7168 (ready), 2766:1621 (running),
// 2774:10286 (failed); Resume tab 2766:2869 (not scored), 2774:10114 (scoring), 2774:10199 (failed).

/** The spinning loader of the running banner and dialog (Banner `icon` takes a component). */
export function ScoringSpinner({ size = 18 }) {
  return <LoaderCircle size={size} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />;
}

ScoringSpinner.propTypes = { size: PropTypes.number };

const RUNNING_TEXT =
  "Your jobs are being scored against your new resume. This can take a couple of minutes. Until then, scores reflect your old resume.";

const COPY = {
  jobs: {
    ready: "Rescore your jobs with your new resume. Until then, scores reflect your old resume.",
    running: RUNNING_TEXT,
    failed: "We couldn’t score your jobs with your new resume. Your old resume is still in use.",
    done: "Done. Your jobs are now scored against your new resume.",
  },
  resume: {
    ready: "Your new resume is uploaded but not scored yet. Your jobs are still scored against your old resume.",
    running: RUNNING_TEXT,
    failed: "Scoring with your new resume didn’t finish. Your jobs are still scored against your old resume.",
  },
};

const VARIANT = { ready: "warning", running: "info", failed: "error", done: "success" };

/**
 * The compact banner for one scoring state. `place` picks the copy: "jobs" (Job Recommendations:
 * ready, running, failed, done) or "resume" (Change Preferences > Resume: ready, running, failed).
 * Renders nothing for any other state. Buttons: ready → onScoreNow ("Score now") on jobs,
 * onGoToJobs ("Go to Job Recommendations") on resume; failed → onTryAgain ("Try again").
 */
export function ScoreNewResumeBanner({ state, place = "jobs", onScoreNow, onTryAgain, onGoToJobs, busy = false, className }) {
  const text = COPY[place]?.[state];
  if (!text) return null;

  let action = null;
  if (state === "ready" && place === "jobs") {
    action = (
      <Button variant="primary" onClick={onScoreNow} disabled={busy}>
        Score now
      </Button>
    );
  } else if (state === "ready" && place === "resume") {
    action = (
      <Button variant="primary" onClick={onGoToJobs}>
        Go to Job Recommendations
      </Button>
    );
  } else if (state === "failed") {
    action = (
      <Button variant="primary" onClick={onTryAgain} disabled={busy}>
        Try again
      </Button>
    );
  }

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
}

ScoreNewResumeBanner.propTypes = {
  /** The scoring state from GET /api/resume/scoring */
  state: PropTypes.oneOf(["none", "ready", "running", "failed", "done"]),
  /** Which page's copy and button */
  place: PropTypes.oneOf(["jobs", "resume"]),
  onScoreNow: PropTypes.func,
  onTryAgain: PropTypes.func,
  onGoToJobs: PropTypes.func,
  /** A start request is on its way: the button is disabled */
  busy: PropTypes.bool,
  className: PropTypes.string,
};

/**
 * The Job Recommendations dialogs. kind:
 *   "ready"    "Rescore your jobs with your new resume?" Later / Score now
 *   "running"  "Scoring your jobs" with the loader, one button "Continue in background"
 *   "failed"   "Scoring didn’t finish" Later / Try again
 * onClose is Later, Continue in background, ESC and a click outside; onConfirm is Score now / Try again.
 */
export function ScoreNewResumeModal({ kind, onClose, onConfirm, busy = false }) {
  if (kind === "running") {
    return (
      <Modal
        variant="form"
        isOpen
        title="Scoring your jobs"
        titleIcon={<ScoringSpinner />}
        hideCancel
        confirmLabel="Continue in background"
        onConfirm={onClose}
        onClose={onClose}
      >
        <p className="text-body-medium font-regular text-neutral-700">
          Scoring your jobs against your new resume. You can leave this page and it will keep going. Your old resume
          stays in use until it’s done.
        </p>
      </Modal>
    );
  }
  const failed = kind === "failed";
  return (
    <Modal
      variant="form"
      isOpen
      title={failed ? "Scoring didn’t finish" : "Rescore your jobs with your new resume?"}
      cancelLabel="Later"
      confirmLabel={failed ? "Try again" : "Score now"}
      confirmDisabled={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p className="text-body-medium font-regular text-neutral-700">
        {failed
          ? "Something went wrong. Your old resume is still in use and your scores haven’t changed."
          : "Your jobs are still scored against your old resume. Scoring with your new one takes a couple of minutes. Your old resume stays in use until it’s done."}
      </p>
    </Modal>
  );
}

ScoreNewResumeModal.propTypes = {
  kind: PropTypes.oneOf(["ready", "running", "failed"]).isRequired,
  /** Later, Continue in background, ESC, backdrop */
  onClose: PropTypes.func,
  /** Score now / Try again */
  onConfirm: PropTypes.func,
  /** A start request is on its way */
  busy: PropTypes.bool,
};

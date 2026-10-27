import PropTypes from "prop-types";

// Design System "Linear progress bar". Step mode (onboarding): fill from completed steps, with an
// "N of M" label. Percent mode (`percent` given, e.g. the Resume Assistant): fill from the value,
// no step label, and the Primary/200 track Figma uses there. The fill eases between values.
const ProgressBar = ({ currentStep = 1, completedSteps, totalSteps = 4, percent }) => {
  const percentMode = typeof percent === "number";
  const fillSteps = completedSteps ?? currentStep;
  const percentage = percentMode ? Math.min(100, Math.max(0, percent)) : (fillSteps / totalSteps) * 100;

  return (
    <div className="flex flex-col gap-sp8 items-end w-full">
      <div className={`h-[10px] w-full rounded-[40px] ${percentMode ? "bg-primary-200" : "bg-neutral-100"}`}>
        <div
          className="h-[10px] rounded-[100px] bg-primary-500 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {!percentMode && (
        <span className="text-body-small text-neutral-500 text-right">
          {currentStep} of {totalSteps}
        </span>
      )}
    </div>
  );
};

ProgressBar.propTypes = {
  /** Which question the user is on (shown in label) */
  currentStep: PropTypes.number,
  /** How many steps completed via Continue (controls fill width) */
  completedSteps: PropTypes.number,
  /** Total number of steps */
  totalSteps: PropTypes.number,
  /** Percent mode: fill 0-100 directly, no step label, Primary/200 track */
  percent: PropTypes.number,
};

export default ProgressBar;

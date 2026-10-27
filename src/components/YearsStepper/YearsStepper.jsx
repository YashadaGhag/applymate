import PropTypes from "prop-types";
import { Minus, Plus } from "lucide-react";

const MIN_YEARS = 0;
const MAX_YEARS = 50;

/**
 * Years of experience: minus, a number box, plus, "years" (Figma Role page). `value` is null
 * until extracted or entered, which shows an empty box. Limits are 0 to 50. Used by the Role
 * page and the Change Preferences years modal.
 */
const YearsStepper = ({ value, onChange, disabled = false }) => {
  const decrement = () => onChange(Math.max((value ?? 0) - 1, MIN_YEARS));
  const increment = () => onChange(Math.min((value ?? 0) + 1, MAX_YEARS));

  return (
    <div className="flex items-center gap-sp8">
      <button
        type="button"
        onClick={decrement}
        disabled={disabled}
        aria-label="Decrease years of experience"
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-xs border-none bg-transparent p-0 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed"
      >
        <Minus size={24} />
      </button>
      <div className="flex size-sp40 shrink-0 items-center justify-center rounded-xs border border-neutral-100 bg-white">
        <input
          type="number"
          min={MIN_YEARS}
          max={MAX_YEARS}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value) || 0)}
          className="w-full bg-transparent text-center text-body-medium text-neutral-700 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <button
        type="button"
        onClick={increment}
        disabled={disabled}
        aria-label="Increase years of experience"
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-xs border-none bg-transparent p-0 text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed"
      >
        <Plus size={24} />
      </button>
      <span className="text-body-medium text-neutral-700">years</span>
    </div>
  );
};

YearsStepper.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default YearsStepper;

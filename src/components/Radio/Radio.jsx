import PropTypes from "prop-types";
import Icon from "../Icon/Icon";

/**
 * Radio — Figma "Radio", Type=List.
 * 18px radio glyph centred in a 24px frame; hover shows a Neutral/25 (Card-neutral) halo.
 * Unselected glyph is Neutral/700; selected uses the radio-selected glyph in Primary/500.
 */
const Radio = ({ label, selected = false, onChange, name, value }) => {
  return (
    <label className="group inline-flex items-center gap-sp8 cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-full group-hover:bg-card-neutral peer-focus-visible:ring-1 peer-focus-visible:ring-inset peer-focus-visible:ring-neutral-700 ${
          selected ? "text-primary-500" : "text-neutral-700"
        }`}
      >
        <Icon name={selected ? "radio-selected" : "radio-unselected"} size={18} />
      </span>
      <span className="text-body-medium font-regular text-neutral-700">
        {label}
      </span>
    </label>
  );
};

Radio.propTypes = {
  /** Text label */
  label: PropTypes.string.isRequired,
  /** Whether this radio is selected */
  selected: PropTypes.bool,
  /** Click handler */
  onChange: PropTypes.func,
  /** Radio group name for accessibility */
  name: PropTypes.string,
  /** Value for this option */
  value: PropTypes.string,
};

export default Radio;

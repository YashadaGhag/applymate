import PropTypes from "prop-types";
import Icon from "../Icon/Icon";

/**
 * Checkbox — Figma "Checkbox", Type=List.
 * 18px checkbox glyph centred in a 24px frame; hover shows a Neutral/25 (Card-neutral) halo.
 * Unchecked glyph is Neutral/700; checked uses the checkbox-selected glyph in Primary/500.
 */
const Checkbox = ({ label, checked = false, onChange }) => {
  return (
    <label className="group flex items-center gap-sp4 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-full group-hover:bg-card-neutral peer-focus-visible:ring-1 peer-focus-visible:ring-inset peer-focus-visible:ring-neutral-700 ${
          checked ? "text-primary-500" : "text-neutral-700"
        }`}
      >
        <Icon name={checked ? "checkbox-selected" : "checkbox-unselected"} size={18} />
      </span>
      <span className="text-body-medium font-regular text-neutral-700">
        {label}
      </span>
    </label>
  );
};

Checkbox.propTypes = {
  /** Text label */
  label: PropTypes.string.isRequired,
  /** Whether checked */
  checked: PropTypes.bool,
  /** Change handler */
  onChange: PropTypes.func,
};

export default Checkbox;

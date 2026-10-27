import PropTypes from "prop-types";
import { X } from "lucide-react";
import InputField from "../InputField/InputField";

/**
 * One website row: label, address field and a remove button. Used by the Role page and the
 * Change Preferences websites modal. The label column is 60 wide from md (Figma).
 */
const WebsiteRow = ({ label, value, error, onChange, onBlur, onRemove, disabled = false }) => (
  <div className="flex w-full flex-col gap-sp8 md:flex-row md:items-start md:gap-sp16">
    <span className="text-body-medium font-regular text-neutral-700 md:mt-sp8 md:w-15 md:shrink-0">
      {label}
    </span>
    <div className="flex w-full items-start gap-sp16 md:flex-1">
      <InputField
        showLabel={false}
        showHelpText={Boolean(error)}
        showIcon={false}
        placeholder="Type here.."
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        error={Boolean(error)}
        helpText={error ?? undefined}
        disabled={disabled}
        aria-label={label}
        className="flex-1"
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="mt-sp8 shrink-0 cursor-pointer border-none bg-transparent p-0 text-neutral-400 transition-colors hover:text-neutral-600 disabled:cursor-not-allowed"
        aria-label={`Remove ${label}`}
      >
        <X size={24} />
      </button>
    </div>
  </div>
);

WebsiteRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  error: PropTypes.string,
  onChange: PropTypes.func,
  onBlur: PropTypes.func,
  onRemove: PropTypes.func,
  disabled: PropTypes.bool,
};

export default WebsiteRow;

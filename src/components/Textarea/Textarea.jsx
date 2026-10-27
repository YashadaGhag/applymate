import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import PropTypes from "prop-types";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-body-small",
        "text-paragraph-headers-small",
        "text-body-medium",
        "text-body-large",
        "text-h5",
        "text-h4",
        "text-h3",
        "text-h2",
        "text-h1",
      ],
    },
  },
});

/** Utility: merge Tailwind classes safely */
const cn = (...inputs) => twMerge(clsx(inputs));

/**
 * Textarea — Design System "textarea" (Default / Selected / Filled / Disabled).
 *
 * From Figma: label body-medium Neutral/700; field white, 1px Neutral/100 border, Radius/s (8px),
 * sp12 × sp8 padding; placeholder body-small Neutral/300; typed text body-medium Neutral/700;
 * helper text body-small Neutral/500. Disabled: Neutral/200 border, Neutral/300 text.
 * Figma's resize glyph is the native vertical resize handle. Hover and focus match InputField
 * (the Design System has no separate focus ring for the textarea). Error has no Figma state:
 * InputField's error colors.
 */
const Textarea = ({
  label,
  showLabel = true,
  placeholder,
  helpText,
  error = false,
  disabled = false,
  rows = 3,
  id,
  name,
  value,
  defaultValue,
  onChange,
  maxLength,
  className,
  ...rest
}) => {
  const fieldId = id ?? (name ? `field-${name}` : undefined);
  const helpId = helpText && fieldId ? `${fieldId}-help` : undefined;

  return (
    <div className={cn("flex w-full flex-col gap-sp8", className)}>
      {showLabel && label && (
        <label
          htmlFor={fieldId}
          className={cn("text-body-medium font-regular", disabled ? "text-neutral-300" : "text-neutral-700")}
        >
          {label}
        </label>
      )}

      <textarea
        id={fieldId}
        name={name}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={helpId}
        aria-invalid={error || undefined}
        className={cn(
          "block w-full resize-y rounded-sm border bg-white px-sp12 py-sp8 outline-none",
          "font-sans font-regular text-body-medium placeholder:text-body-small placeholder:text-neutral-300",
          disabled
            ? "border-neutral-200 text-neutral-300 cursor-not-allowed"
            : error
              ? "border-error-500 text-neutral-700"
              : [
                  "border-neutral-100 text-neutral-700",
                  "hover:border-primary-200 hover:shadow-card",
                  "focus:outline-solid focus:outline-1 focus:outline-offset-4 focus:outline-neutral-700",
                  "focus:border-neutral-100 focus:shadow-none",
                ]
        )}
        {...rest}
      />

      {helpText && (
        <p
          id={helpId}
          className={cn(
            "text-body-small font-regular",
            disabled ? "text-neutral-300" : error ? "text-error-500" : "text-neutral-500"
          )}
        >
          {helpText}
        </p>
      )}
    </div>
  );
};

Textarea.propTypes = {
  /** Visible label above the field */
  label: PropTypes.string,
  /** Show the label (hide it when the page renders its own) */
  showLabel: PropTypes.bool,
  placeholder: PropTypes.string,
  /** Helper / validation text below the field */
  helpText: PropTypes.node,
  /** Error styling (no Figma state: InputField's error colors) */
  error: PropTypes.bool,
  disabled: PropTypes.bool,
  /** Initial height in text rows; the user can resize vertically */
  rows: PropTypes.number,
  id: PropTypes.string,
  name: PropTypes.string,
  /** Controlled value */
  value: PropTypes.string,
  /** Uncontrolled default value */
  defaultValue: PropTypes.string,
  onChange: PropTypes.func,
  maxLength: PropTypes.number,
  /** Extra Tailwind classes on the outer wrapper */
  className: PropTypes.string,
};

export default Textarea;

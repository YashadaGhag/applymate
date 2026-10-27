import { useState } from "react";
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import PropTypes from "prop-types";
import Icon from "../Icon/Icon";

// ─── Tailwind-merge config ────────────────────────────────────────────────────
//
// The default `tailwind-merge` validator for `font-size` only recognises the
// built-in t-shirt scale (sm, base, lg, xl, …).  Our custom tokens
// (text-body-small, text-body-medium, text-body-large, text-h*) don't match,
// so `twMerge` mistakenly classifies them as `text-color` utilities.
// When a real color class follows in the same cn() call it drops the font-size
// class entirely, reverting every piece of text to the browser default size.
//
// Solution: explicitly register each custom token in the `font-size` group so
// `twMerge` keeps both the size and the colour.

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

// ─── Style maps (from Figma token values) ────────────────────────────────────

/**
 * Label colour by state.
 *  – Disabled → neutral-300  (#A4A7B4)
 *  – Error    → error-500    (#B90000)
 *  – Default  → neutral-700  (#3E414E)
 */
const labelColor = (disabled, error) =>
  disabled ? "text-neutral-300" : error ? "text-error-500" : "text-neutral-700";

/**
 * Field border colour by state.
 *
 * The inner field border stays neutral-100 (#E1E2E6) for ALL states including
 * focused — Figma shows the inner border never changes colour.  The focused
 * indicator is a 1px Neutral/700 outline sp4 outside the field (Figma draws it
 * as a wrapper with sp4 padding; an outline avoids the layout shift).
 */
const fieldBorder = (disabled, error) =>
  disabled
    ? "border-neutral-200"
    : error
    ? "border-error-500"
    : "border-neutral-100";

/**
 * Trailing icon colour.
 *  – Disabled           → neutral-200
 *  – Error              → error-500
 *  – Filled (has value) → success-500  (green check = valid)
 *  – Default / focused  → neutral-300
 */
const iconColor = (disabled, error, hasValue) =>
  disabled
    ? "text-neutral-200"
    : error
    ? "text-error-500"
    : hasValue
    ? "text-success-500"
    : "text-neutral-300";

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * InputField — design system text input.
 *
 * States   : default | filled (auto) | focused (CSS) | disabled | error
 * Features : label, placeholder, help text, optional trailing icon
 *
 * Pass `error` + `helpText` for inline validation messages.
 * Pass `iconName` (or `icon` component fn) for a trailing icon; defaults to "check".
 */
const InputField = ({
  label = "Label",
  placeholder = "Placeholder",
  helpText,
  error = false,
  disabled = false,
  showIcon = true,
  showLabel = true,
  showHelpText = true,
  // Icon — explicit component fn takes precedence over iconName string
  icon,
  iconName = "check",
  // Native input pass-throughs
  id,
  name,
  type = "text",
  value,
  defaultValue,
  onChange,
  className,
  ...rest
}) => {
  // Track whether the input has content so the trailing icon can go green
  const [hasValue, setHasValue] = useState(
    Boolean(value !== undefined ? value : defaultValue)
  );

  const handleChange = (e) => {
    setHasValue(e.target.value.length > 0);
    onChange?.(e);
  };

  const fieldId = id ?? (name ? `field-${name}` : undefined);
  const helpId  = helpText && fieldId ? `${fieldId}-help` : undefined;

  // Resolve icon element.
  // `icon` is a React component function (e.g. () => <Icon name="check" />),
  // NOT a pre-rendered JSX element. We call it here so we can pass `size`.
  const resolvedIcon = (() => {
    if (icon) {
      const IconComponent = icon;
      return <IconComponent size={18} />;
    }
    if (iconName) return <Icon name={iconName} size={18} />;
    return null;
  })();

  // Controlled vs uncontrolled – avoids React warning
  const valueProps =
    value !== undefined
      ? { value, onChange: handleChange }
      : { defaultValue, onChange: handleChange };

  return (
    <div className={cn("flex flex-col gap-sp8 w-full", className)}>
      {/* ── Label ─────────────────────────────────────────────────── */}
      {showLabel && label && (
        <label
          htmlFor={fieldId}
          className={cn("text-body-medium font-medium", labelColor(disabled, error))}
        >
          {label}
        </label>
      )}

      {/* ── Field ───────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center gap-sp8 px-sp12 py-sp8",
          "bg-white border rounded-sm",
          fieldBorder(disabled, error),
          !disabled && !error && [
            "hover:bg-card-neutral",
            "focus-within:outline-solid focus-within:outline-1 focus-within:outline-offset-4 focus-within:outline-neutral-700",
            "focus-within:bg-white",
          ]
        )}
      >
        <input
          id={fieldId}
          name={name}
          type={type}
          disabled={disabled}
          placeholder={placeholder}
          aria-describedby={helpId}
          aria-invalid={error || undefined}
          className={cn(
            "flex-1 min-w-0 bg-transparent outline-none",
            "font-sans font-regular text-body-medium",
            "placeholder:text-neutral-500",
            disabled ? "text-neutral-200 cursor-not-allowed" : "text-neutral-700"
          )}
          {...valueProps}
          {...rest}
        />

        {/* ── Trailing icon ──────────────────────────────────────── */}
        {showIcon && resolvedIcon && (
          <span
            className={cn(
              "shrink-0 flex items-center justify-center size-[18px]",
              iconColor(disabled, error, hasValue)
            )}
            aria-hidden="true"
          >
            {resolvedIcon}
          </span>
        )}
      </div>

      {/* ── Help / error text ──────────────────────────────────────── */}
      {showHelpText && helpText && (
        <p
          id={helpId}
          className={cn(
            "text-body-small font-regular",
            disabled
              ? "text-neutral-200"
              : error
              ? "text-error-500"
              : "text-neutral-500"
          )}
        >
          {helpText}
        </p>
      )}
    </div>
  );
};

InputField.propTypes = {
  /** Visible label rendered above the field */
  label: PropTypes.string,
  /** Input placeholder text */
  placeholder: PropTypes.string,
  /** Help / validation message rendered below the field */
  helpText: PropTypes.string,
  /** Applies error styling (red border, red help text, red icon) */
  error: PropTypes.bool,
  /** Disables interaction and applies disabled styling */
  disabled: PropTypes.bool,
  /** Show trailing icon */
  showIcon: PropTypes.bool,
  /** Show label */
  showLabel: PropTypes.bool,
  /** Show help text */
  showHelpText: PropTypes.bool,
  /**
   * React component function rendered as the trailing icon.
   * Receives a `size` prop (18). Color is inherited via `currentColor`.
   * Takes precedence over `iconName`.
   *
   * @example
   * const EyeIcon = (props) => <Icon name="view-on" {...props} />;
   * <InputField icon={EyeIcon} />
   */
  icon: PropTypes.elementType,
  /** Design-system icon name for the trailing icon (default: "check") */
  iconName: PropTypes.string,
  id: PropTypes.string,
  name: PropTypes.string,
  /** Native input type */
  type: PropTypes.string,
  /** Controlled value */
  value: PropTypes.string,
  /** Uncontrolled default value */
  defaultValue: PropTypes.string,
  onChange: PropTypes.func,
  /** Extra Tailwind classes on the outer wrapper */
  className: PropTypes.string,
};

export default InputField;

import PropTypes from "prop-types";
import { Check } from "lucide-react";

const VARIANT_STYLES = {
  default: {
    bg: "bg-white",
    text: "text-neutral-500",
    action: "text-primary-500",
  },
  error: {
    bg: "bg-error-50",
    text: "text-neutral-700",
    action: "text-error-500",
  },
  // Figma "Resume - Success": green surface, a check, the message, and a green action (OK).
  success: {
    bg: "bg-success-50",
    text: "text-neutral-700",
    action: "text-success-500",
    icon: <Check size={18} className="shrink-0 text-success-500" />,
  },
  // Figma "Variant2": black at 64%, white text, message only (no action), sized to its text up to
  // the standard 282px. A label for something on screen (role="tooltip"), not an alert.
  dark: {
    bg: "bg-spotlight-background",
    text: "text-white",
    action: null,
    width: "w-max max-w-[282px]",
    role: "tooltip",
  },
};

const Tooltip = ({
  variant = "default",
  message,
  actionLabel = "Dismiss",
  onAction,
  icon,
  hug = false,
  className = "",
}) => {
  const s = VARIANT_STYLES[variant];
  const leading = icon ?? s.icon;

  return (
    <div
      role={s.role ?? "alert"}
      className={`flex ${hug ? "w-max" : s.width ?? "w-[282px]"} items-center rounded-xs shadow-card ${s.bg} gap-sp8 px-sp12 py-sp8 ${className}`}
    >
      {leading}
      <p className={`flex-1 text-body-medium font-regular ${s.text}`}>{message}</p>
      {s.action && (
        <button
          type="button"
          onClick={onAction}
          className={`shrink-0 cursor-pointer whitespace-nowrap border-none bg-transparent p-0 text-body-medium font-medium ${s.action}`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

Tooltip.propTypes = {
  /** Visual style — default (neutral), error, success (green, with a check), or dark (Figma Variant2: a label, no action) */
  variant: PropTypes.oneOf(["default", "error", "success", "dark"]),
  /** Leading icon (success has a check by default) */
  icon: PropTypes.node,
  /** Size to the content instead of the standard 282px (the Resume tab's result toasts) */
  hug: PropTypes.bool,
  /** Tooltip message text */
  message: PropTypes.node.isRequired,
  /** Trailing action button label (not shown for dark) */
  actionLabel: PropTypes.string,
  /** Action button click handler */
  onAction: PropTypes.func,
  /** Extra Tailwind classes on the outer wrapper */
  className: PropTypes.string,
};

export default Tooltip;

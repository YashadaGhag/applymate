import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import PropTypes from "prop-types";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import Icon from "../Icon/Icon";

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

// ─── Variant config (from Figma token values) ─────────────────────────────────
//
//  All four variants share the same layout:
//    rounded-xs (4 px), border-l-4, padding sp12, icon 20 px, body-medium text.
//
//  Each variant differs only in background, left-border colour, and icon tint.

const VARIANT_CONFIG = {
  success: {
    bg:        "bg-success-50",
    border:    "border-success-500",
    iconColor: "text-success-500",
    label:     "Success",
  },
  info: {
    bg:        "bg-primary-50",
    border:    "border-primary-500",
    iconColor: "text-primary-500",
    label:     "Info",
  },
  warning: {
    bg:        "bg-warning-50",
    border:    "border-warning-500",
    iconColor: "text-warning-500",
    label:     "Warning",
  },
  error: {
    bg:        "bg-error-50",
    border:    "border-error-500",
    iconColor: "text-error-500",
    label:     "Error",
  },
};

// ─── Compact size (Figma "Score new resume banner", 2770:8428 / 8456 / 8972 / 7892) ──────────
//
//  sp8 padding, 18 px icon, body-small (12/16) text, items centred, an optional action (a Button)
//  at the right. Its warning accent is the darker warning-700 Figma uses; each variant has its own
//  default icon (Figma's Warning / Error / Success icons; info keeps info-filled).

const COMPACT_CONFIG = {
  warning: { border: "border-warning-700", iconColor: "text-warning-700", Icon: TriangleAlert },
  error:   { Icon: CircleAlert },
  success: { Icon: CircleCheck },
  info:    {},
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Banner — inline status / feedback notification strip.
 *
 * Variants: success | info | warning | error
 *
 * Left-border accent colour + background tint signal severity.
 * Icon defaults to `info-filled` (filled circle with "i") for all states,
 * matching the Figma design exactly.
 *
 * @example
 * <Banner variant="success" title="Profile updated">
 *   Your changes have been saved successfully.
 * </Banner>
 *
 * @example
 * <Banner variant="error" onClose={() => setBannerVisible(false)}>
 *   Something went wrong. Please try again.
 * </Banner>
 */
const Banner = ({
  variant   = "info",
  children,
  message,
  title,
  icon,
  iconName  = "info-filled",
  showIcon  = true,
  onClose,
  size      = "default",
  action,
  className,
}) => {
  const config = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.info;
  const compact = size === "compact";
  const compactConfig = compact ? COMPACT_CONFIG[variant] ?? {} : {};
  const { bg } = config;
  const border = compactConfig.border ?? config.border;
  const iconColor = compactConfig.iconColor ?? config.iconColor;
  const iconSize = compact ? 18 : 20;

  const bodyContent = children ?? message;

  // Resolve icon element.
  // `icon` is a React component function (e.g. () => <Icon name="info-filled" />),
  // NOT a pre-rendered JSX element. We call it here so we can pass `size`.
  const resolvedIcon = (() => {
    if (icon) {
      const IconComponent = icon;
      return <IconComponent size={iconSize} />;
    }
    if (compactConfig.Icon) {
      const VariantIcon = compactConfig.Icon;
      return <VariantIcon size={iconSize} />;
    }
    if (iconName) return <Icon name={iconName} size={iconSize} />;
    return null;
  })();

  return (
    <div
      role="alert"
      className={cn(
        // Structure — matches Figma: left-border accent, rounded-xs, sp12 padding
        "flex items-start gap-sp8 rounded-xs border-l-4",
        compact ? "p-sp8" : "p-sp12",
        bg,
        border,
        className
      )}
    >
      {/* ── Icon + text row ───────────────────────────────────────── */}
      <div className="flex flex-1 items-center gap-sp8 min-w-0">
        {/* Icon (20 px, tinted by variant) */}
        {showIcon && resolvedIcon && (
          <span
            className={cn(
              "shrink-0 flex items-center justify-center",
              compact ? "size-[18px]" : "size-[20px] self-start mt-[2px]",
              iconColor
            )}
            aria-hidden="true"
          >
            {resolvedIcon}
          </span>
        )}

        {/* Text block */}
        <div className="flex flex-col gap-sp4 flex-1 min-w-0">
          {title && (
            <p className="text-body-medium font-medium text-neutral-700">
              {title}
            </p>
          )}
          <div className={cn("font-regular text-neutral-700", compact ? "text-body-small" : "text-body-medium")}>
            {bodyContent}
          </div>
        </div>

        {/* Optional action (compact): a Button at the right, vertically centred */}
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* ── Optional dismiss button ───────────────────────────────── */}
      {onClose && (
        <button
          onClick={onClose}
          className={cn(
            "shrink-0 flex items-center justify-center",
            // Compact (Figma 2846:13668): the 18 px clear icon in the variant's color, centred.
            compact
              ? cn("size-[18px] self-center", iconColor)
              : "size-[20px] self-start mt-[2px] text-neutral-400 hover:text-neutral-700",
            "transition-colors duration-150",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-700 rounded-xs"
          )}
          aria-label="Dismiss"
          type="button"
        >
          <Icon name="clear" size={compact ? 18 : 16} />
        </button>
      )}
    </div>
  );
};

Banner.propTypes = {
  /** Semantic intent — controls colour palette */
  variant: PropTypes.oneOf(["success", "info", "warning", "error"]),
  /** Body content as React nodes */
  children: PropTypes.node,
  /** Alternative to children for plain-string messages */
  message: PropTypes.node,
  /** Optional bold title rendered above the message */
  title: PropTypes.string,
  /**
   * React component function rendered as the leading icon.
   * Receives a `size` prop (20). Color is inherited via `currentColor`.
   * Takes precedence over `iconName`.
   *
   * @example
   * const AlertIcon = (props) => <Icon name="error" {...props} />;
   * <Banner variant="error" icon={AlertIcon}>…</Banner>
   */
  icon: PropTypes.elementType,
  /** Design-system icon name (default: "info-filled") */
  iconName: PropTypes.string,
  /** Show the leading icon */
  showIcon: PropTypes.bool,
  /** If provided, renders an × dismiss button and calls this on click */
  onClose: PropTypes.func,
  /**
   * "default" (sp12 padding, 20 px icon, 14/20 text) or "compact" (sp8 padding, 18 px icon,
   * 12/16 text, centred; Figma "Score new resume banner"). Compact gives warning, error and
   * success their own icons and the darker warning-700 accent.
   */
  size: PropTypes.oneOf(["default", "compact"]),
  /** An action at the right, e.g. a primary Button (Figma puts one inside the compact banner) */
  action: PropTypes.node,
  /** Extra Tailwind classes */
  className: PropTypes.string,
};

export default Banner;

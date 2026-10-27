import { forwardRef } from "react";
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import PropTypes from "prop-types";
import { Loader2 } from "lucide-react";
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

/**
 * Returns the icon element's size class based on variant + alone mode.
 *
 * From Figma:
 *  - Link alone → 24 px (size-6)
 *  - Pill        → 16 px (size-4)
 *  - Everything else → 18 px (size-[18px])
 */
const iconSizeFor = (variant, alone) => {
  if (variant === "link" && alone) return "size-6";
  if (variant === "pill") return "size-4";
  return "size-[18px]";
};

// ─── Style maps (from Figma token values) ────────────────────────────────────

const BASE =
  "inline-flex items-center justify-center relative " +
  "font-sans font-medium text-body-medium " +
  "transition-colors duration-150 ease-in-out " +
  "select-none focus:outline-none";

const VARIANT_STYLES = {
  // ── Primary ──────────────────────────────────────────────────────────────
  // Focused: 1px Neutral/700 stroke, drawn inset so the button doesn't grow.
  primary: {
    enabled: cn(
      "bg-primary-500 text-white shadow-button rounded-sm",
      "hover:bg-primary-600",
      "active:bg-primary-700",
      "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-700"
    ),
    disabled:
      "bg-neutral-100 text-neutral-300 shadow-none rounded-sm pointer-events-none",
    alone: "px-sp16 py-sp8",
    withText: "px-sp16 py-sp8 min-w-[80px]",
    iconGap: "gap-sp8",
    noIconGap: "gap-sp4",
  },

  // ── Secondary ─────────────────────────────────────────────────────────────
  // Figma draws the 1px stroke inside the button, so it's an inset ring, not a border:
  // icon-only stays 34×34 (sp8 + 18 + sp8) and text buttons 36 tall, same as Primary.
  // Override the stroke colour with ring-* classes (not border-*).
  secondary: {
    enabled: cn(
      "bg-primary-50 text-neutral-700 ring-1 ring-inset ring-primary-200 rounded-sm",
      "hover:bg-primary-100 hover:ring-transparent",
      "active:bg-primary-300 active:ring-primary-300",
      "focus-visible:ring-neutral-700"
    ),
    disabled:
      "bg-neutral-100 text-neutral-300 rounded-sm pointer-events-none",
    alone: "p-sp8",
    withText: "px-sp16 py-sp8 min-w-[80px]",
    iconGap: "gap-sp8",
    noIconGap: "gap-sp4",
  },

  // ── Link ──────────────────────────────────────────────────────────────────
  // Text-only links are Primary/500; links with an icon are Neutral/700.
  // Focused: 1px outline sp4 outside the content (Figma adds sp4 padding + stroke).
  // Icon-alone hover is a Neutral/50 square instead of an underline.
  link: {
    enabled: cn(
      "rounded-sm underline-offset-2",
      "focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-4"
    ),
    textOnly: "text-primary-500 hover:underline focus-visible:outline-primary-500",
    withIcon: "text-neutral-700 hover:underline focus-visible:outline-neutral-700",
    aloneState: "text-neutral-700 hover:bg-neutral-50 focus-visible:outline-neutral-700",
    disabled: "text-neutral-200 rounded-sm pointer-events-none",
    alone: "size-10",           // 40 × 40
    withText: "p-none",         // no padding — link buttons are borderless
    iconGap: "gap-sp4",
    noIconGap: "gap-none",
  },

  // ── Pill ──────────────────────────────────────────────────────────────────
  // Figma radius: text pills use Radius/l (16px = rounded-xl); icon-alone uses
  // Radius/xl (100px = rounded-lg). Icon-alone focus is a 2px Primary/200 stroke.
  // Like Secondary, the stroke is inside (inset ring): text pills are 24 tall
  // (sp4 + 16 + sp4); icon-alone stays 40×40. Override the stroke with ring-* classes.
  pill: {
    enabled: cn(
      "bg-white text-primary-500 ring-1 ring-inset ring-primary-200",
      "hover:bg-primary-100 hover:ring-transparent",
      "active:bg-primary-50 active:ring-primary-200"
    ),
    focusWithText: "focus-visible:ring-neutral-700",
    focusAlone: "focus-visible:ring-2 focus-visible:ring-primary-200",
    disabled:
      "bg-neutral-100 text-neutral-200 ring-1 ring-inset ring-neutral-200 pointer-events-none",
    radiusWithText: "rounded-xl",
    radiusAlone: "rounded-lg",
    alone: "size-10",           // 40 × 40
    withText: "px-sp8 py-sp4",
    iconGap: "gap-sp8",
    noIconGap: "gap-sp4",
  },
};

/** Classes that depend on icon placement: link colour/focus, pill radius/focus. */
const placementClassesFor = (variant, { alone, withIcon, disabled }) => {
  if (variant === "link" && !disabled) {
    const s = VARIANT_STYLES.link;
    if (alone) return s.aloneState;
    return withIcon ? s.withIcon : s.textOnly;
  }
  if (variant === "pill") {
    const s = VARIANT_STYLES.pill;
    return cn(
      alone ? s.radiusAlone : s.radiusWithText,
      !disabled && (alone ? s.focusAlone : s.focusWithText)
    );
  }
  return "";
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Button — design system primitive.
 *
 * Variants : primary | secondary | link | pill
 * Icon positions: none | left | right | alone
 *
 * Accepts either:
 *   icon      — any React node (SVG, img, <Icon />, …)
 *   iconName  — kebab-case string key from the Icon set (convenience shorthand)
 *
 * If both are provided, `icon` wins.
 */
const Button = forwardRef(({
  variant = "primary",
  iconPosition = "none",
  icon,
  iconName,
  children,
  disabled: disabledProp = false,
  loading = false,
  className,
  type = "button",
  ...rest
}, ref) => {
  // Loading is a disabled button with a spinner where the icon was (or in front of the label).
  const disabled = disabledProp || loading;
  const spinner = <Loader2 className="size-full animate-spin motion-reduce:animate-none" />;
  // Resolve the icon element: explicit node takes precedence over iconName string
  const resolvedIcon = loading ? spinner : (icon ?? (iconName ? <Icon name={iconName} /> : null));
  const alone = iconPosition === "alone";
  const hasIcon = Boolean(resolvedIcon);
  const hasText = !alone && Boolean(children);
  const withIcon = hasIcon && !alone;

  const s = VARIANT_STYLES[variant];
  const stateClasses = disabled ? s.disabled : s.enabled;
  const paddingClasses = alone ? s.alone : s.withText;
  const gapClasses = withIcon ? s.iconGap : s.noIconGap;

  // Pill uses body-small + regular weight instead of body-medium + medium
  const typographyOverride =
    variant === "pill" ? "text-body-small font-regular" : "";

  const classes = cn(
    BASE,
    stateClasses,
    placementClassesFor(variant, { alone, withIcon, disabled }),
    paddingClasses,
    gapClasses,
    typographyOverride,
    className
  );

  const iconEl = hasIcon && (
    <span
      className={cn(
        "shrink-0 flex items-center justify-center",
        iconSizeFor(variant, alone)
      )}
      aria-hidden="true"
    >
      {resolvedIcon}
    </span>
  );

  return (
    <button ref={ref} type={type} disabled={disabled} aria-busy={loading || undefined} className={classes} {...rest}>
      {alone ? (
        iconEl
      ) : (
        <>
          {iconPosition === "left" && iconEl}
          {hasText && <span className="whitespace-nowrap">{children}</span>}
          {iconPosition === "right" && iconEl}
        </>
      )}
    </button>
  );
});

Button.propTypes = {
  /** Visual style of the button */
  variant: PropTypes.oneOf(["primary", "secondary", "link", "pill"]),
  /** Where to render the icon relative to the label */
  iconPosition: PropTypes.oneOf(["none", "left", "right", "alone"]),
  /** Icon element (any React node — SVG, img, icon component, etc.) — takes precedence over iconName */
  icon: PropTypes.node,
  /** Convenience shorthand: kebab-case icon name from the design system icon set */
  iconName: PropTypes.string,
  /** Button label */
  children: PropTypes.node,
  /** Disables interaction and applies disabled styling */
  disabled: PropTypes.bool,
  /** Disabled, with a spinner in place of the icon (needs iconPosition left or right) */
  loading: PropTypes.bool,
  /** Extra Tailwind classes (merged safely via tailwind-merge) */
  className: PropTypes.string,
  /** Native button type */
  type: PropTypes.oneOf(["button", "submit", "reset"]),
  /** Click handler */
  onClick: PropTypes.func,
};

export default Button;

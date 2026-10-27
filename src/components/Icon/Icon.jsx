import PropTypes from "prop-types";
import paths, { iconNames } from "./paths";

/**
 * Icon — renders any icon from the design system icon set.
 *
 * Usage:
 *   <Icon name="star" />
 *   <Icon name="arrow-up" size={16} className="text-primary-500" />
 *   <Icon name="close" size={20} aria-label="Close dialog" />
 */
const Icon = ({
  name,
  size = 24,
  className,
  "aria-label": ariaLabel,
  ...rest
}) => {
  const d = paths[name];

  if (!d) {
    if (!import.meta.env.PROD) {
      console.warn(`[Icon] Unknown icon name: "${name}". Available icons: ${iconNames.join(", ")}`);
    }
    return null;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={ariaLabel ? undefined : "true"}
      aria-label={ariaLabel}
      className={className}
      {...rest}
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
};

Icon.propTypes = {
  /** Icon name (kebab-case, e.g. "star", "arrow-up", "calendar") */
  name: PropTypes.oneOf(iconNames).isRequired,
  /** Width and height in pixels */
  size: PropTypes.number,
  /** Extra CSS classes (e.g. Tailwind colour utilities) */
  className: PropTypes.string,
  /** Accessible label — omit for decorative icons (sets aria-hidden) */
  "aria-label": PropTypes.string,
};

export default Icon;

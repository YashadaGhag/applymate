import PropTypes from "prop-types";

// The three bouncing dots from the onboarding matching screen. Animation delays stay inline:
// there's no Tailwind token for a stagger.
// `size="small"` is the 26 x 6 loader of the onboarding loader after Save (Figma "Dot animation").
const DotsLoader = ({ label, size = "default" }) => {
  const small = size === "small";
  const dot = small ? "size-1.5" : "size-[10px]";
  return (
  <div className={`flex items-center ${small ? "gap-sp4" : "gap-sp8"}`} role="status" aria-label={label}>
    <span
      className={`${dot} animate-bounce rounded-full bg-primary-300`}
      style={{ animationDelay: "0ms" }}
    />
    <span
      className={`${dot} animate-bounce rounded-full bg-primary-500`}
      style={{ animationDelay: "150ms" }}
    />
    <span
      className={`${dot} animate-bounce rounded-full bg-primary-300`}
      style={{ animationDelay: "300ms" }}
    />
  </div>
  );
};

DotsLoader.propTypes = {
  /** Accessible name for the status region, e.g. "Finding your matches" */
  label: PropTypes.string.isRequired,
  /** "default" (10px dots) or "small" (6px dots, 26px wide) */
  size: PropTypes.oneOf(["default", "small"]),
};

export default DotsLoader;

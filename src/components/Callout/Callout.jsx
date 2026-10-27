import PropTypes from "prop-types";

const pointerStyles = {
  right: (offset) => ({
    position: "absolute",
    right: "-8px",
    top: `${offset}%`,
    transform: "translateY(-50%)",
    width: 0,
    height: 0,
    borderTop: "8px solid transparent",
    borderBottom: "8px solid transparent",
    borderLeft: "8px solid white",
  }),
  left: (offset) => ({
    position: "absolute",
    left: "-8px",
    top: `${offset}%`,
    transform: "translateY(-50%)",
    width: 0,
    height: 0,
    borderTop: "8px solid transparent",
    borderBottom: "8px solid transparent",
    borderRight: "8px solid white",
  }),
  top: (offset) => ({
    position: "absolute",
    top: "-8px",
    left: `${offset}%`,
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "8px solid transparent",
    borderRight: "8px solid transparent",
    borderBottom: "8px solid white",
  }),
  bottom: (offset) => ({
    position: "absolute",
    bottom: "-8px",
    left: `${offset}%`,
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "8px solid transparent",
    borderRight: "8px solid transparent",
    borderTop: "8px solid white",
  }),
};

const Callout = ({
  text,
  actionText = "Got it",
  onAction,
  pointerPosition = "right",
  pointerOffset = 50,
}) => {
  return (
    <div className="relative w-[282px] bg-white rounded-sm p-sp16 shadow-md flex flex-col gap-sp12 items-end">
      <p className="w-full text-body-medium font-regular text-neutral-500">{text}</p>
      <span
        className="text-body-medium font-medium text-primary-500 cursor-pointer"
        onClick={onAction}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onAction?.()}
      >
        {actionText}
      </span>
      <div style={pointerStyles[pointerPosition](pointerOffset)} />
    </div>
  );
};

Callout.propTypes = {
  text: PropTypes.string.isRequired,
  actionText: PropTypes.string,
  onAction: PropTypes.func,
  pointerPosition: PropTypes.oneOf(["top", "bottom", "left", "right"]),
  pointerOffset: PropTypes.number,
};

export default Callout;

import { useState } from "react";
import PropTypes from "prop-types";
import { ChevronDown, ChevronUp } from "lucide-react";

const Accordion = ({
  title,
  subtitle,
  children,
  defaultOpen = false,
  collapsible = true,
  open: controlledOpen,
  onToggle,
  showDivider = true,
}) => {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const open = collapsible ? isOpen : true;

  const handleToggle = () => {
    if (!isControlled) setInternalOpen((prev) => !prev);
    onToggle?.(!isOpen);
  };

  return (
    <div className="w-full">
      {collapsible ? (
        <button
          type="button"
          onClick={handleToggle}
          className="flex w-full cursor-pointer items-center justify-between gap-sp24 border-none bg-transparent p-0"
        >
          <div className="flex-1 min-w-0 text-left text-body-large font-regular text-neutral-800">
            {title}
          </div>
          {open ? (
            <ChevronUp size={24} className="shrink-0 text-neutral-500" />
          ) : (
            <ChevronDown size={24} className="shrink-0 text-neutral-500" />
          )}
        </button>
      ) : (
        <div className="flex w-full items-center justify-between gap-sp24">
          <div className="flex-1 min-w-0 text-left text-body-large font-regular text-neutral-800">
            {title}
          </div>
        </div>
      )}

      {subtitle && (
        <p className="mt-0 text-body-small font-regular text-neutral-500">
          {subtitle}
        </p>
      )}

      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          // No cap while open: a fixed max-height clipped long content (a company with 26 job cards).
          maxHeight: open ? "none" : "0",
          opacity: open ? 1 : 0,
        }}
      >
        {open && (
          <>
            {showDivider && <div className="mt-sp16 border-t border-neutral-100" />}
            <div className={showDivider ? "mt-sp16" : "mt-sp24"}>{children}</div>
          </>
        )}
      </div>
    </div>
  );
};

Accordion.propTypes = {
  title: PropTypes.node.isRequired,
  subtitle: PropTypes.string,
  children: PropTypes.node,
  defaultOpen: PropTypes.bool,
  /** When false, the accordion is always open and renders without a toggle button/chevron */
  collapsible: PropTypes.bool,
  /** Controlled open state. When provided (with onToggle), the parent owns the open/closed state */
  open: PropTypes.bool,
  /** Called with the next open state on toggle; required to read state when using `open` */
  onToggle: PropTypes.func,
  /** Hides the divider line (and tightens the top margin) between the title and content */
  showDivider: PropTypes.bool,
};

export default Accordion;

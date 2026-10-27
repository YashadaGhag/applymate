import { useEffect, useLayoutEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Check, X } from "lucide-react";
import Button from "../Button/Button";
import InputField from "../InputField/InputField";
import { normalizeLinkInput } from "../../../shared/linkUrl.js";

// No Figma frame for the link control. A small popover under the toolbar's link button, in the
// same style as the Row Actions menu (white, rounded, Neutral/50 border, button shadow, fixed to
// the window so nothing clips it): one address field, Enter applies, Escape cancels, and on an
// existing link "Remove link" too. Validation is shared/linkUrl.js, the same rule the server's
// sanitizer applies, so an address that is refused here is never stored.
const WIDTH = 320;
const EDGE = 16;

/**
 * anchorRef: the element the popover hangs under. initialValue: the current link's address ("" for
 * a new one). onApply(href): called with a checked address. onRemove: present only on an existing
 * link. onClose: Escape, Cancel, or a click away.
 */
const LinkPopover = ({ anchorRef, initialValue = "", onApply, onRemove, onClose }) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const [position, setPosition] = useState(null);
  const panelRef = useRef(null);
  const isExisting = Boolean(onRemove);

  useLayoutEffect(() => {
    const rect = anchorRef.current.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(rect.left, document.documentElement.clientWidth - WIDTH - EDGE));
    setPosition({ top: rect.bottom + 4, left });
  }, [anchorRef]);

  useEffect(() => {
    if (!position) return;
    const input = panelRef.current?.querySelector("input");
    input?.focus();
    input?.select();
  }, [position]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
    };
    const onAway = (e) => {
      if (!panelRef.current?.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onAway, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onAway, true);
    };
  }, [anchorRef, onClose]);

  // Apply needs something in the field (whitespace doesn't count); Enter in an empty field does nothing.
  const canApply = value.trim().length > 0;

  const submit = (e) => {
    e.preventDefault();
    if (!canApply) return;
    const result = normalizeLinkInput(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onApply(result.href);
  };

  return (
    <form
      ref={panelRef}
      role="dialog"
      aria-label={isExisting ? "Edit link" : "Add link"}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      // Fixed to the window and placed from the button's rectangle; the numbers can't be classes.
      style={position ? { top: position.top, left: position.left, width: WIDTH } : { visibility: "hidden", width: WIDTH }}
      className="fixed z-20 flex flex-col gap-sp12 rounded-sm border border-neutral-50 bg-white p-sp12 shadow-button"
    >
      <InputField
        label="Link address"
        placeholder="https://example.com"
        name="link-address"
        showIcon={false}
        value={value}
        error={Boolean(error)}
        helpText={error || undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="flex items-center justify-between gap-sp8">
        {isExisting ? (
          <Button variant="link" type="button" onClick={onRemove}>
            Remove link
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-sp8">
          {/* The tertiary (link) style, the same pair as Cancel and Save in the editor header. */}
          <Button variant="link" iconPosition="left" icon={<X size={18} />} type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="link" iconPosition="left" icon={<Check size={18} />} type="submit" disabled={!canApply}>
            Apply
          </Button>
        </div>
      </div>
    </form>
  );
};

LinkPopover.propTypes = {
  anchorRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  initialValue: PropTypes.string,
  onApply: PropTypes.func.isRequired,
  onRemove: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};

export default LinkPopover;

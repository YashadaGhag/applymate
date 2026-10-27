import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { ChevronRight, MoreHorizontal } from "lucide-react";

// Figma "Row Actions" menu: a small popover from the "…" button, white, rounded, one row per
// action (icon + label), a highlighted row on hover or focus, and a nested submenu on "Change
// status". Menu roles, arrow keys, Escape closes and returns focus to the button.
//
// The popover is position: fixed (placed from the button's rectangle), so the table's horizontal
// scroll container never clips it. It closes on scroll and resize, which would leave it adrift.
// The submenu opens to the left: the actions column sits at the right edge of the table.

const ITEM =
  "flex w-full cursor-pointer items-center gap-sp8 rounded-xs border-none bg-transparent p-sp8 text-left text-body-small font-regular text-neutral-700 hover:bg-primary-50 focus:bg-primary-50 focus:outline-none";
// Figma 2728:11740: the menu is 200 wide; a submenu is at least 200 and grows to fit its longest
// label (215 for Applied, with "Revert to application pending"). Labels never wrap.
const PANEL = "rounded-sm border border-neutral-50 bg-white p-sp4 shadow-button";

function Row({ item, innerRef, onSelect, expanded, onToggleSub, controlsId }) {
  const Icon = item.icon;
  const hasSub = Boolean(item.submenu);
  return (
    <button
      ref={innerRef}
      type="button"
      role="menuitem"
      aria-haspopup={hasSub ? "menu" : undefined}
      aria-expanded={hasSub ? expanded : undefined}
      aria-controls={hasSub && expanded ? controlsId : undefined}
      className={ITEM}
      onClick={() => (hasSub ? onToggleSub() : onSelect(item))}
    >
      {Icon && <Icon size={16} className="shrink-0 text-neutral-700" aria-hidden="true" />}
      <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
      {hasSub && <ChevronRight size={16} className="shrink-0 text-neutral-700" aria-hidden="true" />}
    </button>
  );
}

/**
 * items: [{ key, label, icon?, onSelect? } | { key, label, icon?, submenu: [{ key, label, icon?, onSelect }] }].
 * `label` names the button for screen readers ("Actions for Northwind, Product Designer").
 */
const RowActionsMenu = ({ items, label }) => {
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const rowRefs = useRef([]);
  const subRefs = useRef([]);
  const focusSubOnOpen = useRef(false);
  const menuId = useId();
  const subId = useId();

  const close = useCallback((returnFocus) => {
    setOpen(false);
    setSubOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Place the popover under the button, right edges aligned.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: document.documentElement.clientWidth - rect.right });
  }, [open]);

  // Focus the first row once the menu is placed.
  useEffect(() => {
    if (open && position) rowRefs.current[0]?.focus();
  }, [open, position]);

  useEffect(() => {
    if (subOpen && focusSubOnOpen.current) {
      focusSubOnOpen.current = false;
      subRefs.current[0]?.focus();
    }
  }, [subOpen]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) close(false);
    };
    const onAway = () => close(false);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onAway);
    window.addEventListener("scroll", onAway, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onAway);
      window.removeEventListener("scroll", onAway, true);
    };
  }, [open, close]);

  const select = (item) => {
    close(true);
    item.onSelect?.();
  };

  const move = (refs, step) => {
    const list = refs.current.filter(Boolean);
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement);
    const next = index === -1 ? (step > 0 ? 0 : list.length - 1) : (index + step + list.length) % list.length;
    list[next].focus();
  };

  const onMenuKeyDown = (e) => {
    const parentIndex = items.findIndex((i) => i.submenu);
    if (e.key === "ArrowDown") move(rowRefs, 1);
    else if (e.key === "ArrowUp") move(rowRefs, -1);
    else if (e.key === "Home") rowRefs.current[0]?.focus();
    else if (e.key === "End") rowRefs.current[items.length - 1]?.focus();
    else if (e.key === "ArrowRight" && parentIndex !== -1 && document.activeElement === rowRefs.current[parentIndex]) {
      focusSubOnOpen.current = true;
      setSubOpen(true);
    } else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") close(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  };

  const onSubKeyDown = (e) => {
    if (e.key === "ArrowDown") move(subRefs, 1);
    else if (e.key === "ArrowUp") move(subRefs, -1);
    else if (e.key === "Home") subRefs.current[0]?.focus();
    else if (e.key === "ArrowLeft" || e.key === "Escape") {
      setSubOpen(false);
      rowRefs.current[items.findIndex((i) => i.submenu)]?.focus();
    } else return;
    e.preventDefault();
    // The submenu handled it: the menu's own Escape and arrow handling must not also run.
    e.stopPropagation();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="flex size-6 cursor-pointer items-center justify-center rounded-xs border-none bg-transparent p-0 text-neutral-800 hover:bg-neutral-50 focus-visible:outline-solid focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-neutral-700"
      >
        <MoreHorizontal size={24} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          // Fixed to the window and placed from the button's rectangle, so it is never clipped by
          // the table's scroll container; the numbers can't be classes.
          style={position ?? { visibility: "hidden" }}
          className={`fixed z-20 w-50 ${PANEL}`}
        >
          {items.map((item, i) => (
            <div key={item.key} className="relative">
              <Row
                item={item}
                innerRef={(el) => {
                  rowRefs.current[i] = el;
                }}
                onSelect={select}
                expanded={subOpen}
                onToggleSub={() => {
                  focusSubOnOpen.current = !subOpen;
                  setSubOpen((v) => !v);
                }}
                controlsId={subId}
              />
              {item.submenu && subOpen && (
                <div
                  id={subId}
                  role="menu"
                  aria-label={item.label}
                  onKeyDown={onSubKeyDown}
                  className={`absolute right-full top-0 mr-sp4 w-max min-w-50 ${PANEL}`}
                >
                  {item.submenu.map((sub, j) => (
                    <Row
                      key={sub.key}
                      item={sub}
                      innerRef={(el) => {
                        subRefs.current[j] = el;
                      }}
                      onSelect={select}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

RowActionsMenu.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      icon: PropTypes.elementType,
      onSelect: PropTypes.func,
      submenu: PropTypes.arrayOf(
        PropTypes.shape({
          key: PropTypes.string.isRequired,
          label: PropTypes.string.isRequired,
          icon: PropTypes.elementType,
          onSelect: PropTypes.func.isRequired,
        })
      ),
    })
  ).isRequired,
  /** Accessible name of the "…" button and the menu */
  label: PropTypes.string.isRequired,
};

export default RowActionsMenu;

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import PropTypes from "prop-types";
import Icon from "../Icon/Icon";

// The open menu stops this far above the bottom of the window and scrolls inside itself, so every
// option can be reached however low the select sits.
const MENU_BOTTOM_GAP = 40;
const MENU_MAX_HEIGHT = 400;
const MENU_MIN_HEIGHT = 96;

const Select = ({
  value = null,
  onChange,
  placeholder = "Select...",
  options = [],
  error = false,
  errorMessage = "",
  leftIcon,
  showChevron = true,
  disabled = false,
  menuWidth = "trigger",
  getItemClassName,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  // Room left under the trigger (minus the gap to the window's bottom); set while open.
  const [menuMaxHeight, setMenuMaxHeight] = useState(MENU_MAX_HEIGHT);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const fit = () => {
      const bottom = containerRef.current?.getBoundingClientRect().bottom ?? 0;
      // 4px is the gap between the trigger and the menu.
      const room = window.innerHeight - bottom - 4 - MENU_BOTTOM_GAP;
      setMenuMaxHeight(Math.min(MENU_MAX_HEIGHT, Math.max(room, MENU_MIN_HEIGHT)));
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit, true);
    };
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item) => {
    onChange?.(item);
    setOpen(false);
  };

  // Figma: icons are Neutral/700, Error/500 in the error state, Neutral/200 when disabled
  // (text too; the disabled border is Borders/Disabled/Light = Neutral/50).
  const iconColor = disabled ? "text-neutral-200" : error ? "text-error-500" : "text-neutral-700";

  return (
    <div className="w-full relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        // Focus matches InputField: 1px Neutral/700 outline sp4 outside, border unchanged.
        className={`w-full rounded-sm border bg-white px-sp12 py-sp8 flex items-center gap-sp8 ${
          disabled
            ? "border-neutral-50 cursor-not-allowed"
            : error
            ? "border-error-500 cursor-pointer"
            : "border-neutral-100 cursor-pointer hover:bg-card-neutral focus:bg-white focus:outline-solid focus:outline-1 focus:outline-offset-4 focus:outline-neutral-700"
        }`}
      >
        {leftIcon && (
          <span className={`flex shrink-0 ${iconColor}`}>{leftIcon}</span>
        )}
        {/* Filled (a value chosen): 14px. The placeholder stays 12px. */}
        <span
          className={`font-regular flex-1 text-left ${
            disabled ? "text-neutral-200" : "text-neutral-700"
          } ${value ? "text-body-medium" : "text-body-small"}`}
        >
          {value || placeholder}
        </span>
        {showChevron && (
          <Icon
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            className={`shrink-0 ${iconColor}`}
          />
        )}
      </button>

      {/* Dropdown — Figma "Select Options" (Section Title variant) with "menu item" rows */}
      {open && (
        <div
          // Dynamic: depends on where the select sits in the window.
          style={{ maxHeight: menuMaxHeight }}
          className={`absolute mt-sp4 flex flex-col gap-sp8 bg-white p-sp8 rounded-sm shadow-button overflow-y-auto z-10 ${
            menuWidth === "content" ? "min-w-full w-max overflow-x-hidden" : "w-full"
          }`}
        >
          {options.map((group, groupIndex) => (
            <div key={group.group ?? groupIndex} className="flex flex-col gap-sp8">
              {/* Section title sits directly on its divider (no gap between them). A group without
                  a title is a plain list. */}
              {group.group && (
                <div className="flex flex-col">
                  <div className="px-sp12 py-sp8 text-body-medium font-regular text-neutral-700">
                    {group.group}
                  </div>
                  <div className="border-t border-neutral-25" />
                </div>
              )}
              {group.items.map((item) => (
                <div
                  key={item}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(item);
                  }}
                  className={`${group.group ? "pl-sp24 pr-sp8" : "px-sp12"} py-sp8 rounded-xs text-body-small font-regular text-neutral-700 cursor-pointer hover:bg-primary-50 ${
                    menuWidth === "content" ? "whitespace-nowrap" : ""
                  } ${getItemClassName?.(item) ?? ""}`}
                >
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {error && errorMessage && (
        <p className="text-body-small text-error-500 mt-sp8">{errorMessage}</p>
      )}
    </div>
  );
};

Select.propTypes = {
  /** Currently selected value */
  value: PropTypes.string,
  /** Called with selected value */
  onChange: PropTypes.func,
  /** Placeholder text when nothing selected */
  placeholder: PropTypes.string,
  /** Options array with grouped items */
  options: PropTypes.arrayOf(
    PropTypes.shape({
      /** Section title; leave it out for a plain list with no heading or divider */
      group: PropTypes.string,
      items: PropTypes.arrayOf(PropTypes.string).isRequired,
    })
  ),
  /** Shows error state */
  error: PropTypes.bool,
  /** Error text shown below select */
  errorMessage: PropTypes.string,
  /** Optional icon rendered before the label text */
  leftIcon: PropTypes.node,
  /** Show the trailing chevron (default true; the disabled "Filter" select in Figma has none) */
  showChevron: PropTypes.bool,
  /** Disabled look: Neutral/50 border, Neutral/200 text and icons, not clickable */
  disabled: PropTypes.bool,
  /** "trigger" (default): the menu matches the trigger's width. "content": at least the
      trigger's width, growing to fit the longest item on one line (no truncation, no scrollbar). */
  menuWidth: PropTypes.oneOf(["trigger", "content"]),
  /** Optional extra classes for an item's row, e.g. a font family per item */
  getItemClassName: PropTypes.func,
};

export default Select;

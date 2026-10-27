import { forwardRef } from "react";
import PropTypes from "prop-types";
import { Search } from "lucide-react";
import Icon from "../Icon/Icon";

/**
 * SearchBar — Figma "Search" (Design System 639:2418).
 * 8px radius (radius - s), body-small text, 16px right icon, optional 18px left search icon
 * (`showLeftIcon`, Figma's property, off by default). Focus is a 1px Neutral/700 outline sp4 outside the
 * box (Figma draws a wrapper with sp4 padding; an outline avoids the layout shift).
 * Search glyph is Lucide (not in the Icon set); Clear uses the Icon set.
 */
const SearchBar = forwardRef(
  ({ placeholder = "Search...", value, onChange, onClear, onKeyDown, disabled = false, showLeftIcon = false }, ref) => {
    const hasValue = value !== undefined ? value.length > 0 : false;
    const inputProps = value !== undefined ? { value, onChange } : { defaultValue: "" };

    return (
      <div
        className={`flex items-center gap-sp8 rounded-sm border bg-white px-sp12 py-sp8 ${
          disabled
            ? "border-neutral-50"
            : "border-neutral-100 hover:bg-card-neutral focus-within:bg-white focus-within:outline-solid focus-within:outline-1 focus-within:outline-offset-4 focus-within:outline-neutral-700"
        }`}
      >
        {showLeftIcon && (
          <Search size={18} aria-hidden="true" className={`shrink-0 ${disabled ? "text-neutral-200" : "text-neutral-700"}`} />
        )}
        <input
          ref={ref}
          type="text"
          disabled={disabled}
          {...inputProps}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={`min-w-0 flex-1 border-none outline-none bg-transparent text-body-small font-regular ${
            disabled
              ? "text-neutral-200 cursor-not-allowed placeholder:text-neutral-200"
              : "text-neutral-700 placeholder:text-neutral-300"
          }`}
        />
        {hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="flex shrink-0 text-neutral-700 cursor-pointer bg-transparent border-none p-0"
            aria-label="Clear search"
          >
            <Icon name="clear" size={16} />
          </button>
        ) : (
          <Search size={16} className={`shrink-0 ${disabled ? "text-neutral-200" : "text-neutral-700"}`} />
        )}
      </div>
    );
  }
);

SearchBar.displayName = "SearchBar";

SearchBar.propTypes = {
  placeholder: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func,
  onClear: PropTypes.func,
  onKeyDown: PropTypes.func,
  disabled: PropTypes.bool,
  /** Figma's showLeftIcon: an 18px search icon before the text. */
  showLeftIcon: PropTypes.bool,
};

export default SearchBar;

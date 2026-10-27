import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import Button from "../Button/Button";
import Icon from "../Icon/Icon";

// Figma "menu item" (Default / Hover): p-sp8, body-small, Background/Blue on hover.
const MENU_ITEM =
  "p-sp8 rounded-xs text-body-small font-regular text-neutral-700 cursor-pointer hover:bg-primary-50";

const MultiselectChips = ({
  values = [],
  onChange,
  placeholder = "Type to add more",
  recommendations = [],
  suggestions = [],
  maxSelections = 5,
  onInputChange,
  filterSuggestions = true,
  showWhenEmpty = false,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const atMax = values.length >= maxSelections;

  const typed = inputValue.trim();
  const isSelected = (val) => values.some((v) => v.toLowerCase() === val.toLowerCase());

  // With filterSuggestions={false} the caller has already matched suggestions to the text
  // (e.g. a server search), so they're shown as given, minus anything already selected.
  const filteredSuggestions =
    (typed || showWhenEmpty) && suggestions.length > 0
      ? suggestions.filter(
          (s) =>
            (!typed || !filterSuggestions || s.toLowerCase().includes(typed.toLowerCase())) &&
            !isSelected(s)
        )
      : [];

  // Suggestions are a convenience, not a gate: whatever was typed can always be added.
  // If it matches a suggestion exactly (ignoring case), the suggestion's spelling is used.
  const exactSuggestion = suggestions.find((s) => s.toLowerCase() === typed.toLowerCase());
  const canAddTyped = Boolean(typed) && !exactSuggestion && !isSelected(typed);

  const showDropdown = dropdownOpen && (typed || showWhenEmpty) && !atMax;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addValue = (val) => {
    const trimmed = val.trim();
    if (!trimmed || isSelected(trimmed) || atMax) return;
    onChange?.([...values, trimmed]);
  };

  const removeValue = (val) => {
    onChange?.(values.filter((v) => v !== val));
  };

  const selectSuggestion = (val) => {
    addValue(val);
    setInputValue("");
    onInputChange?.("");
    setDropdownOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      selectSuggestion(exactSuggestion ?? inputValue);
    }
    if (e.key === "Backspace" && !inputValue && values.length > 0) {
      removeValue(values[values.length - 1]);
    }
    if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    setDropdownOpen(true);
    onInputChange?.(e.target.value);
  };

  const availableRecommendations = recommendations.filter(
    (r) => !values.includes(r)
  );

  return (
    <div className="w-full relative" ref={containerRef}>
      {/* Input container */}
      <div
        // Focus matches InputField: 1px Neutral/700 outline sp4 outside, border unchanged.
        className={`w-full rounded-xs border border-neutral-100 px-sp12 py-sp4 flex flex-wrap items-center gap-sp8 ${
          focused
            ? "bg-white outline-solid outline-1 outline-offset-4 outline-neutral-700"
            : "bg-white hover:bg-card-neutral"
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Chip = Figma Pill button, Selected state, clear icon on the right.
            Inside stroke (inset ring) like the pill Button, so chips are 24 tall. */}
        {values.map((val) => (
          <span
            key={val}
            className="bg-primary-50 ring-1 ring-inset ring-primary-200 rounded-xl px-sp8 py-sp4 flex items-center gap-sp8"
          >
            <span className="text-body-small font-regular text-primary-500">
              {val}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeValue(val);
              }}
              className="flex text-primary-500 cursor-pointer shrink-0"
              aria-label={`Remove ${val}`}
            >
              <Icon name="clear" size={16} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setFocused(true);
            if (inputValue.trim() || showWhenEmpty) setDropdownOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            // Typed text is kept as a chip on blur, same as Enter. Dropdown rows use
            // preventDefault on mousedown, so picking a suggestion doesn't trigger this.
            if (typed) {
              addValue(exactSuggestion ?? inputValue);
              setInputValue("");
              onInputChange?.("");
            }
            setDropdownOpen(false);
          }}
          disabled={atMax}
          placeholder={atMax ? "Maximum reached" : placeholder}
          // py-sp4 makes the empty row as tall as a chip (24), so the field height
          // doesn't jump when the first chip is added.
          className="flex-1 min-w-[120px] py-sp4 bg-transparent outline-none text-body-small font-regular text-neutral-700 placeholder:text-neutral-500 disabled:cursor-not-allowed"
        />
      </div>

      {/* Dropdown — same list styling as Figma "Select Options" (Default) with "menu item" rows */}
      {showDropdown && (canAddTyped || filteredSuggestions.length > 0) && (
        <div className="absolute w-full mt-sp4 flex flex-col gap-sp8 bg-white px-sp4 py-sp8 rounded-sm shadow-button max-h-[240px] overflow-y-auto z-10">
          {canAddTyped && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(typed);
              }}
              className={MENU_ITEM}
            >
              Add “{typed}”
            </div>
          )}
          {filteredSuggestions.map((suggestion) => (
            <div
              key={suggestion}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(suggestion);
              }}
              className={MENU_ITEM}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Recommendations — Figma Pill buttons */}
      {!atMax && availableRecommendations.length > 0 && (
        <div className="flex flex-wrap items-center gap-sp8 mt-sp12">
          <span className="text-body-small font-regular text-neutral-800">
            Recommended:
          </span>
          {availableRecommendations.map((rec) => (
            <Button key={rec} variant="pill" onClick={() => addValue(rec)}>
              {rec}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

MultiselectChips.propTypes = {
  /** Currently selected values */
  values: PropTypes.arrayOf(PropTypes.string),
  /** Called with updated array when chips are added/removed */
  onChange: PropTypes.func,
  /** Input placeholder text */
  placeholder: PropTypes.string,
  /** Suggested values shown below input as clickable chips */
  recommendations: PropTypes.arrayOf(PropTypes.string),
  /** Type-ahead options. Optional help only: typed text can always be added (Enter, comma, or "Add …"). */
  suggestions: PropTypes.arrayOf(PropTypes.string),
  /** Maximum number of selections allowed */
  maxSelections: PropTypes.number,
  /** Called with the input text on every change (and "" when it's cleared), e.g. to run a search */
  onInputChange: PropTypes.func,
  /** Set false when `suggestions` already match the text (server search); they're shown as given */
  filterSuggestions: PropTypes.bool,
  /** Show the suggestions as soon as the field is focused, before anything is typed (designation) */
  showWhenEmpty: PropTypes.bool,
};

export default MultiselectChips;

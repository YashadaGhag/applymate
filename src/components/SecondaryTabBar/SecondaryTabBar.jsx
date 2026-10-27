import { useEffect, useRef } from "react";
import PropTypes from "prop-types";

// Design System "Secondary Tab bar": a 1px Neutral/100 rule under the whole bar; each tab carries
// its own bottom border (2px Primary/500 when active, 1px Neutral/100 otherwise). Tabs are fixed
// width on desktop (Figma 199px, sp200 here) and share the row equally below md.
// `scrollable` (Change Preferences, Figma mobile 2841:24678): below md the tabs hug their label on
// one line and the row scrolls sideways, with the active tab scrolled into view.
// Disabled has no Figma state: simplest option, Neutral/300 text and no pointer.
const SecondaryTabBar = ({ tabs, activeKey, onChange, scrollable = false }) => {
  const activeRef = useRef(null);
  const scrollerRef = useRef(null);

  useEffect(() => {
    if (!scrollable) return undefined;
    // Keep the active tab fully in view. Run again once fonts load: they change the tabs' widths.
    const reveal = () => {
      const scroller = scrollerRef.current;
      const tab = activeRef.current;
      if (!scroller || !tab) return;
      const right = tab.offsetLeft + tab.offsetWidth;
      if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth;
      else if (tab.offsetLeft < scroller.scrollLeft) scroller.scrollLeft = tab.offsetLeft;
    };
    reveal();
    document.fonts?.ready.then(reveal);
    return undefined;
  }, [scrollable, activeKey]);

  const bar = (
    <div
      role="tablist"
      className={`flex items-center border-b border-neutral-100 ${scrollable ? "w-max min-w-full" : "w-full"}`}
    >
      {tabs.map(({ key, label, disabled = false }) => {
        const isActive = key === activeKey;
        return (
          <button
            key={key}
            ref={isActive ? activeRef : null}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => !isActive && onChange?.(key)}
            className={`flex items-center justify-center bg-white px-sp16 py-sp8 text-body-medium text-center -mb-px transition-colors md:w-sp200 md:flex-none ${
              scrollable ? "flex-none whitespace-nowrap" : "flex-1"
            } ${
              isActive
                ? "border-b-2 border-primary-500 font-medium text-primary-500"
                : disabled
                  ? "border-b border-neutral-100 font-regular text-neutral-300 cursor-not-allowed"
                  : "border-b border-neutral-100 font-regular text-neutral-800 cursor-pointer hover:text-neutral-900"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  if (!scrollable) return bar;
  return <div ref={scrollerRef} className="relative w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{bar}</div>;
};

SecondaryTabBar.propTypes = {
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.node.isRequired,
      disabled: PropTypes.bool,
    })
  ).isRequired,
  activeKey: PropTypes.string.isRequired,
  onChange: PropTypes.func,
  /** Below md: tabs hug their label and the row scrolls sideways */
  scrollable: PropTypes.bool,
};

export default SecondaryTabBar;

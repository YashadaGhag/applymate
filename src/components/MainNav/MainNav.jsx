import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import Tooltip from "../Tooltip/Tooltip";
import { Briefcase, BriefcaseBusiness, ClipboardList, Bookmark, Settings, Menu, X } from "lucide-react";

const NAV_ITEMS = [
  { key: "recommendations", label: "Job Recommendations", icon: BriefcaseBusiness, path: "/jobs" },
  { key: "tracker", label: "Application Tracker", icon: ClipboardList, path: "/tracker" },
  { key: "saved", label: "Saved Jobs", icon: Bookmark, path: "/saved" },
];

const PREFERENCES_ITEM = { key: "preferences", label: "Change Preferences", icon: Settings, path: "/preferences" };

// collapsible: in the desktop sidebar, which is an icon-only rail between md and xl, below 1280 (Figma
// "Collapsed navbar"); the wordmark and item labels show again from xl. The mobile bar never collapses.
const Logo = ({ collapsible = false }) => (
  <a href="/" aria-label="ApplyMate" className="flex items-center gap-sp8 no-underline">
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-sm"
      style={{
        backgroundImage: "linear-gradient(135deg, #BCC5F1 0%, #5065D3 100%)",
        filter: "drop-shadow(0px 0px 7.5px rgba(59,130,246,0.5))",
      }}
    >
      <Briefcase size={14} color="white" strokeWidth={2.5} />
    </span>
    <span className={`whitespace-nowrap text-body-large font-medium text-neutral-800 ${collapsible ? "md:max-xl:hidden" : ""}`}>
      ApplyMate
    </span>
  </a>
);

Logo.propTypes = { collapsible: PropTypes.bool };

// The rail's label on hover or keyboard focus: the dark Tooltip (Figma Variant2), beside the icon.
// Hidden from screen readers: the button's own (visually hidden) label already names it.
const RailLabel = ({ label }) => (
  <span
    aria-hidden="true"
    className="pointer-events-none absolute left-full top-1/2 z-50 ml-sp8 hidden -translate-y-1/2 whitespace-nowrap md:max-xl:group-hover:block md:max-xl:group-focus-visible:block"
  >
    <Tooltip variant="dark" message={label} />
  </span>
);

RailLabel.propTypes = { label: PropTypes.string.isRequired };

const NavItem = ({ label, icon: Icon, isActive, onClick, collapsible = false }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={isActive ? "page" : undefined}
    className={`group relative flex w-full items-center gap-sp4 rounded-sm border-none px-sp12 py-sp8 text-body-medium cursor-pointer transition-colors ${
      collapsible ? "md:max-xl:justify-center" : ""
    } ${
      isActive
        ? "bg-card-blue font-medium text-neutral-700"
        : "bg-transparent font-regular text-neutral-800 hover:bg-neutral-50"
    }`}
  >
    <Icon size={24} className={`shrink-0 ${isActive ? "text-neutral-700" : "text-neutral-800"}`} />
    <span className={collapsible ? "md:max-xl:sr-only" : ""}>{label}</span>
    {collapsible && <RailLabel label={label} />}
  </button>
);

NavItem.propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  isActive: PropTypes.bool,
  onClick: PropTypes.func,
  collapsible: PropTypes.bool,
};

const MainNav = ({ activeItem = "recommendations" }) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleNavigate = (path) => {
    setIsExpanded(false);
    navigate(path);
  };

  return (
    <>
      {/* Desktop sidebar */}
      {/* Desktop sidebar: an icon-only rail (w-nav-rail) between md and xl (below 1280), full width from xl.
          z-20 so the rail's hover labels sit above the page content. */}
      <aside className="hidden md:flex sticky top-0 z-20 h-screen w-nav-rail xl:w-[241px] shrink-0 flex-col border-r border-primary-200 bg-white p-sp16">
        <Logo collapsible />

        <div className="mt-sp24 -mx-sp16 border-b border-neutral-100" />

        <div className="mt-sp24 flex min-h-0 flex-1 flex-col justify-between">
          <nav className="flex flex-col gap-sp12">
            {NAV_ITEMS.map(({ key, label, icon, path }) => (
              <NavItem
                key={key}
                label={label}
                icon={icon}
                isActive={activeItem === key}
                onClick={() => handleNavigate(path)}
                collapsible
              />
            ))}
          </nav>

          <div>
            <div className="-mx-sp16 border-t border-neutral-100" />
            <div className="mt-sp16">
              <NavItem
                label={PREFERENCES_ITEM.label}
                icon={PREFERENCES_ITEM.icon}
                isActive={activeItem === PREFERENCES_ITEM.key}
                onClick={() => handleNavigate(PREFERENCES_ITEM.path)}
                collapsible
              />
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div
        className={`md:hidden bg-white shadow-button ${
          isExpanded ? "fixed inset-0 z-40 flex flex-col" : "sticky top-0 z-30 w-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-sp16 py-sp16">
          <Logo />
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? "Close menu" : "Open menu"}
            aria-expanded={isExpanded}
            className="flex size-10 shrink-0 items-center justify-center rounded-sm border-none bg-transparent cursor-pointer"
          >
            {isExpanded ? (
              <X size={24} className="text-neutral-800" />
            ) : (
              <Menu size={24} className="text-neutral-800" />
            )}
          </button>
        </div>

        {isExpanded && (
          <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-sp16 pb-sp16">
            <nav className="flex flex-col gap-sp12">
              {NAV_ITEMS.map(({ key, label, icon, path }) => (
                <NavItem
                  key={key}
                  label={label}
                  icon={icon}
                  isActive={activeItem === key}
                  onClick={() => handleNavigate(path)}
                />
              ))}
            </nav>

            <div>
              <div className="h-px w-full bg-neutral-100" />
              <div className="mt-sp16">
                <NavItem
                  label={PREFERENCES_ITEM.label}
                  icon={PREFERENCES_ITEM.icon}
                  isActive={activeItem === PREFERENCES_ITEM.key}
                  onClick={() => handleNavigate(PREFERENCES_ITEM.path)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

MainNav.propTypes = {
  activeItem: PropTypes.oneOf(["recommendations", "tracker", "saved", "preferences"]),
};

export default MainNav;

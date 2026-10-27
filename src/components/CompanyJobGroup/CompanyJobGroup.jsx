import { useEffect, useState, Children } from "react";
import PropTypes from "prop-types";
import Accordion from "../Accordion/Accordion";
import Button from "../Button/Button";
import Icon from "../Icon/Icon";
import CompanyLogo from "../JobCard/CompanyLogo";

const DESKTOP_QUERY = "(min-width: 768px)";
const VISIBLE_JOBS_CAP = 2;

const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const handler = (e) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDesktop;
};

// Location lives on each job card (next to the title), not in the company header.
const CompanyHeader = ({ company, companyDomain }) => (
  <div className="flex items-center gap-sp16">
    <CompanyLogo company={company} companyDomain={companyDomain} />
    <span className="text-body-large font-medium text-neutral-800">{company}</span>
  </div>
);

/**
 * Wraps a company's job cards as one visual unit for the Job Recommendations
 * "Watchlist" tab. On desktop it's a tinted card with a left accent rail,
 * always expanded. On mobile it's a collapsible accordion with a full
 * outline whose color signals open (primary-500) vs closed (primary-200).
 * Only the first two jobs show by default; "See all N jobs" reveals the rest.
 */
const CompanyJobGroup = ({ company, companyDomain, children, showAll: showAllProp, onShowAll }) => {
  const isDesktop = useIsDesktop();
  const [isOpen, setIsOpen] = useState(true);
  const [showAllOwn, setShowAllOwn] = useState(false);
  // The page can own "See all N jobs" (so it survives a visit to Job Details); without it the group keeps its own.
  const showAll = showAllProp ?? showAllOwn;

  const jobCards = Children.toArray(children);
  const hasMore = jobCards.length > VISIBLE_JOBS_CAP;
  const visibleJobCards = showAll ? jobCards : jobCards.slice(0, VISIBLE_JOBS_CAP);
  const stackedJobCards = isDesktop
    ? visibleJobCards
    : visibleJobCards.flatMap((card, i) =>
        i === 0 ? [card] : [<div key={`divider-${card.key}`} className="h-px w-full bg-neutral-100" />, card]
      );

  const wrapperClasses = isDesktop
    ? "bg-card-blue border-l-4 border-primary-500 p-sp24"
    : `bg-white border border-t-4 p-sp16 ${isOpen ? "border-primary-500" : "border-primary-200"}`;

  return (
    <div className={`w-full rounded-sm ${wrapperClasses}`}>
      <Accordion
        title={<CompanyHeader company={company} companyDomain={companyDomain} />}
        collapsible={!isDesktop}
        open={isOpen}
        onToggle={setIsOpen}
        showDivider={!isDesktop}
      >
        <div className="flex flex-col gap-sp24">
          <div className={`flex flex-col ${isDesktop ? "gap-sp24" : "gap-sp40"}`}>
            {stackedJobCards}
          </div>
          {/* Figma: Link button with icon (Neutral/700), forward-long arrow */}
          {hasMore && !showAll && (
            <Button
              variant="link"
              iconPosition="right"
              icon={<Icon name="arrow-forward-long" size={18} />}
              onClick={() => (onShowAll ? onShowAll() : setShowAllOwn(true))}
              className="self-start"
            >
              See all {jobCards.length} jobs
            </Button>
          )}
        </div>
      </Accordion>
    </div>
  );
};

CompanyJobGroup.propTypes = {
  company: PropTypes.string.isRequired,
  companyDomain: PropTypes.string,
  children: PropTypes.node,
  /** Controlled "See all N jobs" state (optional) */
  showAll: PropTypes.bool,
  onShowAll: PropTypes.func,
};

export default CompanyJobGroup;

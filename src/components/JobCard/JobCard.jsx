import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import { Bookmark, Check, ArrowUpRight, ThumbsDown, ChevronRight, TriangleAlert } from "lucide-react";
import MatchScore from "../MatchScore/MatchScore";
import Button from "../Button/Button";
import CompanyLogo from "./CompanyLogo";
import Tooltip from "../Tooltip/Tooltip";
import { formatCompensation, formatPostedLabel } from "../../../shared/jobFormatting.js";

// One line: the lead location and "+N" for the rest (never wraps, so it can't squeeze the title).
// With more than one, the full list shows on hover and keyboard focus in the dark Tooltip and is the
// accessible name. Falls back to the plain location text for callers without the summary.
const LocationLabel = ({ location, lead, more = 0, all = [] }) => {
  const text = lead ?? location;
  if (!text) return null;
  if (!more) return <span className="shrink-0 whitespace-nowrap text-body-small text-neutral-700">{text}</span>;
  const full = all.join("; ");
  return (
    <span
      tabIndex={0}
      role="group"
      aria-label={`Locations: ${full}`}
      className="group relative shrink-0 whitespace-nowrap text-body-small text-neutral-700 focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-neutral-700"
    >
      <span aria-hidden="true">
        {text} +{more}
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-full z-50 mt-sp4 hidden whitespace-normal group-hover:block group-focus-visible:block"
      >
        <Tooltip variant="dark" message={full} />
      </span>
    </span>
  );
};

LocationLabel.propTypes = {
  location: PropTypes.string,
  /** The location to show (the first that fits this profile, else the first listed) and how many others the posting lists; the full list shows in a Tooltip */
  locationLead: PropTypes.string,
  locationMore: PropTypes.number,
  locations: PropTypes.arrayOf(PropTypes.string),
  lead: PropTypes.string,
  more: PropTypes.number,
  all: PropTypes.arrayOf(PropTypes.string),
};

const Dot = () => (
  <span className="size-1 shrink-0 rounded-full bg-neutral-700" />
);

// Figma "No sponsorship tag" chip (Radius/l, warning icon 15px). Copy kept as the code's
// "No visa sponsorship"; Figma says "No sponsorship available".
const NoSponsorshipTag = () => (
  <span className="inline-flex shrink-0 items-center gap-sp4 rounded-xl px-sp8 py-sp4 text-body-small bg-warning-50 text-warning-700">
    <TriangleAlert size={15} />
    No visa sponsorship
  </span>
);

const JobCard = ({
  id,
  title,
  company,
  companyDomain,
  location,
  locationLead,
  locationMore,
  locations,
  postedAt,
  postedAtKind,
  firstSeenAt,
  ai,
  compensation,
  statedCompensation,
  flagNoSponsorship = false,
  showCompany = true,
  isSaved = false,
  onSave,
  onCustomize,
  customizeDisabled = false,
  onApply,
  onDismiss,
  customizeButtonRef,
}) => {
  const navigate = useNavigate();
  const [isDismissing, setIsDismissing] = useState(false);

  const postedLabel = formatPostedLabel({ postedAt, postedAtKind, firstSeenAt });
  // ATS pay first, else the range read from the posting text; both come from the posting.
  const compensationLabel = formatCompensation(compensation ?? statedCompensation);
  const hasAi = Boolean(ai);
  const hasCompensation = Boolean(compensationLabel);

  // The card slides out, then the page drops it and shows the "Job posting dismissed" toast.
  const handleDismiss = () => {
    if (isDismissing) return;
    setIsDismissing(true);
    setTimeout(() => {
      onDismiss?.();
    }, 300);
  };

  const titleEl = (
    <span
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/jobs/${id}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/jobs/${id}`)}
      className="min-w-0 text-body-large font-medium text-primary-500 cursor-pointer hover:underline"
    >
      {title}
    </span>
  );

  // Figma: Secondary icon-only buttons. No saved state for the card in Figma: the saved
  // look reuses Job Details' treatment (Primary/100 fill, Primary/300 border, filled bookmark).
  const saveButton = (
    <Button
      variant="secondary"
      iconPosition="alone"
      icon={
        <Bookmark
          size={18}
          className={isSaved ? "text-primary-500" : undefined}
          fill={isSaved ? "currentColor" : "none"}
        />
      }
      onClick={onSave}
      aria-pressed={isSaved}
      aria-label={isSaved ? "Remove from saved jobs" : "Save job"}
      className={`shrink-0 ${isSaved ? "bg-primary-100 ring-primary-300" : ""}`}
    />
  );

  const dislikeButton = (className = "") => (
    <Button
      variant="secondary"
      iconPosition="alone"
      icon={<ThumbsDown size={18} />}
      onClick={handleDismiss}
      aria-label="Dismiss job"
      className={`shrink-0 ${className}`}
    />
  );

  // Desktop header right side: Figma puts the sponsorship tag next to Save.
  const desktopHeaderActions = (
    <div className="flex shrink-0 items-center gap-sp16">
      {flagNoSponsorship && <NoSponsorshipTag />}
      {saveButton}
    </div>
  );

  return (
    <div
      className={`relative w-full ${
        showCompany
          ? "border border-primary-200 rounded-sm p-sp16"
          : "rounded-md p-0 md:border md:border-primary-200 md:p-sp16"
      } bg-white flex flex-col gap-sp16 transition-all duration-300 hover:shadow-card ${
        isDismissing ? "translate-x-full opacity-0" : ""
      }`}
    >
      {/* Row 1: Header */}
      {showCompany ? (
        <>
          {/* Mobile: company header, then title/actions row */}
          <div className="flex flex-col gap-sp16 md:hidden">
            <div className="flex items-center gap-sp16">
              <CompanyLogo company={company} companyDomain={companyDomain} />
              <div className="flex flex-col gap-[2px]">
                <span className="text-body-large font-medium text-neutral-800">{company}</span>
                <LocationLabel location={location} lead={locationLead} more={locationMore} all={locations} />
              </div>
            </div>
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-[2px]">
                {titleEl}
                <span className="text-body-small text-neutral-700">{postedLabel}</span>
              </div>
              <div className="flex items-center gap-sp16">
                {saveButton}
                {dislikeButton()}
              </div>
            </div>
          </div>

          {/* Desktop: single row */}
          <div className="hidden md:flex items-start justify-between">
            <div className="flex gap-sp16">
              <CompanyLogo company={company} companyDomain={companyDomain} />
              <div className="flex flex-col gap-[2px]">
                {titleEl}
                <div className="flex items-center gap-sp8">
                  <span className="text-body-medium font-medium text-neutral-700">{company}</span>
                  <Dot />
                  <LocationLabel location={location} lead={locationLead} more={locationMore} all={locations} />
                  <Dot />
                  <span className="shrink-0 whitespace-nowrap text-body-small text-neutral-700">{postedLabel}</span>
                </div>
              </div>
            </div>
            {desktopHeaderActions}
          </div>
        </>
      ) : (
        <>
          {/* Mobile: title, posted time and location stacked, Save + Dislike together */}
          <div className="flex items-start justify-between md:hidden">
            <div className="flex flex-col">
              {titleEl}
              <span className="text-body-small text-neutral-700">{postedLabel}</span>
              {location && <LocationLabel location={location} lead={locationLead} more={locationMore} all={locations} />}
            </div>
            <div className="flex items-center gap-sp16">
              {saveButton}
              {dislikeButton()}
            </div>
          </div>

          {/* Desktop: single row, dot separators, tag + Save */}
          <div className="hidden md:flex items-start justify-between">
            <div className="flex items-center gap-sp8">
              {titleEl}
              <Dot />
              <span className="shrink-0 whitespace-nowrap text-body-small text-neutral-700">{postedLabel}</span>
              {location && (
                <>
                  <Dot />
                  <LocationLabel location={location} lead={locationLead} more={locationMore} all={locations} />
                </>
              )}
            </div>
            {desktopHeaderActions}
          </div>
        </>
      )}

      {/* Mobile: the tag gets its own row under the title (desktop shows it in the header) */}
      {flagNoSponsorship && (
        <div className="flex md:hidden">
          <NoSponsorshipTag />
        </div>
      )}

      {/* Row 2: Match Score Banner — hidden until the job has been AI-scored. No band label on
          cards: the ring's color carries the band (Job Details keeps the label). */}
      {hasAi && (
        <div className="flex items-center gap-sp8 border border-primary-200 bg-primary-50 rounded-sm p-sp12">
          <MatchScore percentage={ai.score} band={ai.band} />
          <span className="text-body-medium font-regular text-neutral-700">{ai.reasoning}</span>
        </div>
      )}

      {/* Row 3: Details */}
      <div className="flex flex-col md:flex-row gap-sp24">
        {/* Left: Role Highlights — hidden until the job has been AI-scored */}
        {hasAi && (
          <div className="flex-1">
            <span className="text-body-small font-regular text-neutral-500 uppercase">
              Role Highlights
            </span>
            <div className="mt-sp8 flex flex-col gap-sp8">
              {ai.highlights.map((highlight, i) => (
                <div key={i} className="flex items-start gap-sp8">
                  <Check size={18} className="text-success-500 shrink-0 mt-[2px]" />
                  <span className="text-body-medium text-neutral-700">{highlight}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right: Compensation */}
        <div className={hasAi ? "w-full md:w-[45%] shrink-0" : "flex-1"}>
          {hasCompensation && (
            <>
              <span className="text-body-small font-regular text-neutral-500 uppercase">
                Compensation
              </span>
              <p className="mt-sp8 text-body-medium font-medium text-neutral-700">{compensationLabel}</p>
              <p className="text-body-small font-regular text-neutral-500">From the posting</p>
            </>
          )}
        </div>
      </div>

      {/* Row 4: Action Bar */}
      <div
        className={`flex items-center justify-between ${
          showCompany ? "border-t border-neutral-100 pt-sp16" : "md:border-t md:border-neutral-100 md:pt-sp16"
        }`}
      >
        <button
          type="button"
          onClick={onApply}
          className="flex items-center gap-sp4 shrink-0 whitespace-nowrap bg-transparent border-none cursor-pointer text-body-medium font-medium text-primary-500 hover:underline transition-colors p-0"
        >
          Apply now
          <ArrowUpRight size={18} />
        </button>
        <div className="flex items-center gap-sp16">
          {/* On mobile, the dislike action already lives in the header next to Save */}
          {dislikeButton("hidden md:inline-flex")}
          <Button
            ref={customizeButtonRef}
            variant="primary"
            iconPosition="right"
            icon={<ChevronRight size={18} />}
            disabled={customizeDisabled}
            onClick={onCustomize}
          >
            Customize application
          </Button>
        </div>
      </div>
    </div>
  );
};

JobCard.propTypes = {
  id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  title: PropTypes.string.isRequired,
  company: PropTypes.string.isRequired,
  companyDomain: PropTypes.string,
  location: PropTypes.string,
  /** ISO timestamp, or null when not known — falls back to firstSeenAt with "found" */
  postedAt: PropTypes.string,
  postedAtKind: PropTypes.oneOf(["posted", "updated", "found"]),
  firstSeenAt: PropTypes.string,
  /** null means the job hasn't been AI-scored yet — hides the match score banner and role highlights */
  ai: PropTypes.shape({
    score: PropTypes.number,
    band: PropTypes.oneOf(["strong", "moderate"]),
    reasoning: PropTypes.string,
    highlights: PropTypes.arrayOf(PropTypes.string),
  }),
  /** null means compensation data isn't available — hides the Compensation block */
  compensation: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
    currency: PropTypes.string,
    isEstimate: PropTypes.bool,
  }),
  /** Pay range read from the posting text (server/scraper/postingFacts.js); used when the ATS gives no structured compensation. */
  statedCompensation: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
    currency: PropTypes.string,
    period: PropTypes.oneOf(["annual", "hourly"]),
  }),
  /** The posting says it won't sponsor and the profile needs sponsorship — shows the "No visa sponsorship" tag. */
  flagNoSponsorship: PropTypes.bool,
  /** Hides the company logo/name row — used when the card renders inside a CompanyJobGroup, which already shows the company once in its header. Location then sits after the posted time. */
  showCompany: PropTypes.bool,
  /** Fills the bookmark. */
  isSaved: PropTypes.bool,
  /** Bookmark click: toggles saved. */
  onSave: PropTypes.func,
  onCustomize: PropTypes.func,
  /** Disables "Customize application" (a closed job), like Job Details. */
  customizeDisabled: PropTypes.bool,
  /** "Apply now" link click: the page opens the posting and saves the pending application. */
  onApply: PropTypes.func,
  /** Thumbs-down click, called after the card's slide-out. */
  onDismiss: PropTypes.func,
  customizeButtonRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
};

export default JobCard;

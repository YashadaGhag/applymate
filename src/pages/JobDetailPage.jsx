import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ThumbsDown,
  Bookmark,
  DollarSign,
  MapPin,
  Clock,
  ChevronRight,
  ArrowUpRight,
  Check,
  Undo2,
} from "lucide-react";
import MainLayout from "../components/MainLayout";
import Button from "../components/Button/Button";
import Banner from "../components/Banner/Banner";
import MatchScore from "../components/MatchScore/MatchScore";
import CompanyLogo from "../components/JobCard/CompanyLogo";
import DotsLoader from "../components/DotsLoader";
import { useJob } from "../hooks/useJob";
import { useJobActions } from "../context/JobActionsContext";
import { useApplication } from "../hooks/useApplication";
import { useJobDocuments } from "../hooks/useJobDocuments";
import { useListReturn } from "../hooks/useListReturn";
import DownloadFilesPanel from "../components/DownloadFilesPanel";
import SpotlightOverlay from "../components/SpotlightOverlay/SpotlightOverlay";
import {
  bandTextClass,
  formatBand,
  formatPostedLabel,
  formatYearsOfExperience,
  postingPayLabel,
} from "../../shared/jobFormatting.js";

const Dot = () => (
  <span className="size-1 shrink-0 rounded-full bg-neutral-300" />
);

// Tailwind descendant selectors give the sanitized HTML description real structure
// (headings/paragraphs/lists) without needing a typography plugin or inline styles.
const DESCRIPTION_HTML_CLASSES =
  "[&_h1]:text-body-large [&_h1]:font-medium [&_h1]:text-neutral-800 [&_h1]:mt-sp24 [&_h1]:mb-sp8 [&_h1:first-child]:mt-0 " +
  "[&_h2]:text-body-large [&_h2]:font-medium [&_h2]:text-neutral-800 [&_h2]:mt-sp24 [&_h2]:mb-sp8 [&_h2:first-child]:mt-0 " +
  "[&_h3]:text-body-medium [&_h3]:font-medium [&_h3]:text-neutral-800 [&_h3]:mt-sp16 [&_h3]:mb-sp8 [&_h3:first-child]:mt-0 " +
  "[&_h4]:text-body-medium [&_h4]:font-medium [&_h4]:text-neutral-800 [&_h4]:mt-sp16 [&_h4]:mb-sp8 " +
  "[&_p]:mb-sp16 [&_p:last-child]:mb-0 " +
  "[&_ul]:list-disc [&_ul]:pl-sp24 [&_ul]:mb-sp16 [&_ol]:list-decimal [&_ol]:pl-sp24 [&_ol]:mb-sp16 " +
  "[&_li]:mb-sp4 [&_a]:text-primary-500 [&_a]:underline";

// A dismiss that saves faster than this goes straight to /jobs without flashing the loader.
const DISMISS_LOADER_DELAY_MS = 300;
// Same delay for Mark as applied.
const LOADER_DELAY_MS = DISMISS_LOADER_DELAY_MS;

const APPLIED_DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
function formatAppliedDate(iso) {
  return APPLIED_DATE_FORMAT.format(new Date(iso));
}

// Below md the page starts 40 under the top bar (Figma mobile 2830:14254): the layout's 16 plus 24.
function JobDetailLayout({ children }) {
  return (
    <MainLayout activeItem="recommendations">
      <div className="pt-sp24 md:pt-0">{children}</div>
    </MainLayout>
  );
}

// Figma 2690:7203: the breadcrumb (12/16, helper-text colour, a link back to the list) 24 above the
// 20/20 Medium title. The back arrow in the old header is gone: the breadcrumb is the way back.
function HeaderRow({ title }) {
  // The way back is the list view the person came from (tab, page, sort, search, scroll), not the default one.
  const back = useListReturn();
  return (
    <div className="flex flex-col gap-sp24">
      <nav aria-label="Breadcrumb" className="text-body-small text-neutral-500">
        {/* The link sets its own colour: the global link colour in src/index.css would win. */}
        <Link to={back.to} state={back.state} className="text-neutral-500 hover:text-neutral-500 hover:underline">
          {back.label}
        </Link>
      </nav>
      <h1 className="m-0 text-h5 font-medium text-neutral-700">{title}</h1>
    </div>
  );
}

export default function JobDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const back = useListReturn();
  const {
    isSaved: isJobSaved,
    isDismissed: isJobDismissed,
    toggleSave,
    dismiss,
    restore,
    downloadFilesTipSeen,
    markDownloadFilesTipSeen,
    markAppliedTipSeen,
    markMarkAppliedTipSeen,
  } = useJobActions();

  const { job, status } = useJob(jobId);
  // isDismissing: a dismiss is being saved (blocks a second click). showDismissLoader: the save
  // has taken longer than DISMISS_LOADER_DELAY_MS, so the three-dot loader replaces the content
  // until it finishes. A fast save navigates straight to /jobs with no loader at all.
  const [isDismissing, setIsDismissing] = useState(false);
  const [showDismissLoader, setShowDismissLoader] = useState(false);
  const isMounted = useRef(true);
  const loaderTimer = useRef(null);
  const markTimer = useRef(null);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      clearTimeout(loaderTimer.current);
      clearTimeout(markTimer.current);
    };
  }, []);

  // The application state comes from the server: the job's record and whether a tailored draft is
  // saved. Mark as applied waits for the server; a save slower than the delay shows the same
  // three-dot loader as the dismiss flow until it finishes.
  const application = useApplication(job);
  // The documents the job has (saved tailored resume and/or cover letter), for Download Files. A GET.
  const documents = useJobDocuments(jobId);
  const [isMarking, setIsMarking] = useState(false);
  // The spotlight targets of the two one-time tips.
  const downloadPanelRef = useRef(null);
  const markButtonRef = useRef(null);
  const [showMarkLoader, setShowMarkLoader] = useState(false);
  // Mark as applied and Revert to application pending share the busy flag and the loader; this is
  // the loader's label.
  const [markLoaderLabel, setMarkLoaderLabel] = useState("Marking as applied");

  if (showDismissLoader || showMarkLoader) {
    // Figma 2690:7355 dims the page behind a spinner. Simplest option: the dots centred in the
    // content area, as the dismiss flow does.
    return (
      <JobDetailLayout>
        <div className="flex justify-center py-sp100">
          <DotsLoader label={showMarkLoader ? markLoaderLabel : "Dismissing job"} />
        </div>
      </JobDetailLayout>
    );
  }

  if (status === "loading") {
    return (
      <JobDetailLayout>
        <HeaderRow title="Job Details" />
        <p className="mt-sp24 text-center text-body-medium text-neutral-500">Loading job…</p>
      </JobDetailLayout>
    );
  }

  if (status === "error") {
    return (
      <JobDetailLayout>
        <HeaderRow title="Job Details" />
        <p className="mt-sp24 text-center text-body-medium text-neutral-500">
          Couldn't load this job right now. Try refreshing the page.
        </p>
      </JobDetailLayout>
    );
  }

  if (status === "not_found") {
    return (
      <JobDetailLayout>
        <HeaderRow title="Job Details" />
        <div className="mt-sp24 flex flex-col items-center gap-sp24 pt-sp40">
          <div className="flex flex-col items-center gap-sp8 text-center">
            <h2 className="text-h5 font-medium text-neutral-800">This job couldn't be found</h2>
            <p className="max-w-[384px] text-body-medium text-neutral-500">
              It may have been removed, or the link may be out of date.
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate(back.to, { state: back.state })}>
            Back to {back.label}
          </Button>
        </div>
      </JobDetailLayout>
    );
  }

  // ATS pay first, else the range read from the posting text; both come from the posting.
  const compensationLabel = postingPayLabel(job);
  const yearsLabel = formatYearsOfExperience(job.statedYearsOfExperience);
  const postedLabel = formatPostedLabel(job);
  const hasAi = Boolean(job.ai);
  const bandLabel = formatBand(job.ai?.band);
  const hasSidebar = hasAi || Boolean(compensationLabel) || Boolean(yearsLabel);
  const hasDescription = Boolean(job.descriptionHtml || job.descriptionText);
  const isSaved = isJobSaved(job.id);
  // Only seen when a dismissed job's page is opened directly; clicking again restores it. Not
  // shown while this page's own dismiss is saving (the job is already marked dismissed then).
  const isDismissed = isJobDismissed(job.id) && !isDismissing;

  // The "Job posting dismissed" toast is deferred: Job Recommendations shows it once its list
  // has loaded without this job. A failed save keeps the user here with an error toast.
  const handleDismiss = async () => {
    if (isDismissed) {
      restore(job.id);
      return;
    }
    if (isDismissing) return;
    setIsDismissing(true);
    loaderTimer.current = setTimeout(() => setShowDismissLoader(true), DISMISS_LOADER_DELAY_MS);
    const ok = await dismiss(job.id, { deferToast: true });
    clearTimeout(loaderTimer.current);
    if (!isMounted.current) return;
    if (ok) {
      // Back to the same place in the list (it refetches without this job; the page clamps if this was the
      // last job on its page). Replaces this page in the history, so back never lands on a dismissed job.
      navigate(back.to, { replace: true, state: back.state });
      return;
    }
    setShowDismissLoader(false);
    setIsDismissing(false);
  };

  // A status change from this page (Mark as applied, or Revert to application pending): waits for
  // the server; a save slower than LOADER_DELAY_MS shows the loader. The record in page state
  // changes only on success, so the buttons switch in place with no reload or navigation.
  const changeStatus = async (loaderLabel, change) => {
    if (isMarking) return;
    setIsMarking(true);
    setMarkLoaderLabel(loaderLabel);
    markTimer.current = setTimeout(() => setShowMarkLoader(true), LOADER_DELAY_MS);
    await change();
    clearTimeout(markTimer.current);
    if (!isMounted.current) return;
    setShowMarkLoader(false);
    setIsMarking(false);
  };
  const handleMarkApplied = () => changeStatus("Marking as applied", application.markApplied);
  const handleRevert = () => changeStatus("Reverting to application pending", application.revertToPending);

  const goCustomize = () => navigate(`/jobs/${encodeURIComponent(job.id)}/customize`);
  const customizeLabel = "Customize application";
  const applyNowLabel = "Apply now";
  const record = application.application;

  // Primary and link slots, by state. The primary carries the chevron (or the check), the link the
  // external icon, as in Figma 2690:6803 / 6993 / 7355. A closed job keeps both disabled and never
  // creates a pending record.
  let cta = null;
  if (application.status === "ready") {
    if (record && record.status !== "pending") {
      // Applied or later: a plain label, no Customize or Apply now. Applied only (Figma 2749:7135)
      // also gets the link to its right; interviewing, offer and not moving forward never go back
      // (the server answers 409), so they get none. A closed job keeps the link, like the label.
      cta = (
        <>
          <span className="flex items-center gap-sp8 text-body-medium font-medium text-neutral-800">
            <Check size={18} className="text-success-500" aria-hidden="true" />
            {record.appliedAt ? `Applied on ${formatAppliedDate(record.appliedAt)}` : "Applied"}
          </span>
          {record.status === "applied" && (
            <Button variant="link" iconPosition="left" icon={<Undo2 size={18} />} disabled={isMarking} onClick={handleRevert}>
              Revert to application pending
            </Button>
          )}
        </>
      );
    } else {
      const customizeLink = (
        <Button variant="link" iconPosition="right" icon={<ArrowUpRight size={18} />} disabled={job.closed} onClick={goCustomize}>
          {customizeLabel}
        </Button>
      );
      const applyLink = (
        <Button variant="link" iconPosition="right" icon={<ArrowUpRight size={18} />} disabled={job.closed} onClick={application.apply}>
          {applyNowLabel}
        </Button>
      );
      if (record) {
        cta = (
          <>
            <Button ref={markButtonRef} variant="primary" iconPosition="right" icon={<Check size={18} />} disabled={isMarking} onClick={handleMarkApplied}>
              Mark as applied
            </Button>
            {customizeLink}
          </>
        );
      } else if (application.hasDraft) {
        cta = (
          <>
            <Button variant="primary" iconPosition="right" icon={<ChevronRight size={18} />} disabled={job.closed} onClick={application.apply}>
              {applyNowLabel}
            </Button>
            {customizeLink}
          </>
        );
      } else {
        cta = (
          <>
            <Button variant="primary" iconPosition="right" icon={<ChevronRight size={18} />} disabled={job.closed} onClick={goCustomize}>
              {customizeLabel}
            </Button>
            {applyLink}
          </>
        );
      }
    }
  }

  // The two one-time tips (flags saved on the server; any dismissal sets one: "Got it", Escape, a
  // click anywhere, a click on the target). A tip needs its state read to have finished (null =
  // loading or failed: never shown) and its target on screen: the panel (the job has a document) or
  // the Mark as applied button (a pending record, job open). One at a time: Download Files first;
  // once it is dismissed by any means it is no longer due, so the Mark as applied tip follows.
  const downloadTipDue = downloadFilesTipSeen === false && documents.length > 0;
  const markTipDue =
    markAppliedTipSeen === false &&
    application.status === "ready" &&
    record?.status === "pending" &&
    !job.closed;
  const showDownloadTip = downloadTipDue;
  const showMarkTip = !downloadTipDue && markTipDue;

  return (
    <JobDetailLayout>
      <HeaderRow title="Job Details" />

      {job.closed && (
        <div className="mt-sp24">
          <Banner variant="warning">
            This job is no longer accepting applications. It's been left here as a record — the
            details below are from the last time it was seen open.
          </Banner>
        </div>
      )}

      {/* Top Section — the card-blue tint and padding are desktop-only per Figma; mobile
          sits flush against the page's own horizontal padding. */}
      <div className="mt-sp24 rounded-sm flex flex-col gap-sp24 md:bg-card-blue md:px-sp12 md:py-sp16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-sp16">
            <CompanyLogo company={job.company.name} companyDomain={job.company.domain} />
            <div className="flex flex-col gap-[2px]">
              <span className="text-body-medium font-regular md:text-body-large md:font-medium text-neutral-800">
                {job.title}
              </span>
              <span className="text-body-medium font-regular md:font-medium text-neutral-800">
                {job.company.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-sp16">
            {/* Same Secondary icon-only Button as JobCard (34×34). Dismissed and saved
                states only override the fill and stroke colours. */}
            <Button
              variant="secondary"
              iconPosition="alone"
              icon={
                <ThumbsDown size={18} className={isDismissed ? "text-error-500" : undefined} />
              }
              onClick={handleDismiss}
              aria-pressed={isDismissed}
              aria-label={isDismissed ? "Restore job" : "Dismiss job"}
              className={isDismissed ? "bg-error-50 ring-error-200" : ""}
            />
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
              onClick={() => toggleSave(job.id)}
              aria-pressed={isSaved}
              aria-label={isSaved ? "Remove from saved jobs" : "Save job"}
              className={isSaved ? "bg-primary-100 ring-primary-300" : ""}
            />
          </div>
        </div>

        {/* Metadata row — compensation is only shown when the posting states it. Stated years
            of experience live in the score panel, not here. */}
        <div className="flex items-center gap-sp8 flex-wrap">
          {compensationLabel && (
            <>
              <div className="flex items-center gap-sp4">
                <DollarSign size={18} className="text-neutral-500" />
                <span className="text-body-small font-regular text-neutral-800">
                  {compensationLabel}
                </span>
              </div>
              <Dot />
            </>
          )}
          {job.location && (
            <>
              <div className="flex items-center gap-sp4">
                <MapPin size={18} className="text-neutral-500" />
                <span className="text-body-small font-regular text-neutral-800">
                  {job.location}
                </span>
              </div>
              <Dot />
            </>
          )}
          <div className="flex items-center gap-sp4">
            <Clock size={18} className="text-neutral-500" />
            <span className="text-body-small font-regular text-neutral-800">{postedLabel}</span>
          </div>
        </div>

        {/* CTA buttons */}
        {/* Customize only opens the page: tailoring and the cover letter each start from their own
            button there. Nothing shows until the application state has loaded, so the buttons
            never flip. */}
        {cta && <div className="flex items-center gap-sp24">{cta}</div>}
      </div>

      {/* Two-column layout — mobile stacks the sidebar above the description (per Figma); order
          classes keep the markup order unchanged for the conditional sidebar logic below. */}
      <div className="mt-sp32 flex flex-col md:flex-row gap-sp40 items-start">
        {/* Left column */}
        <div className="order-2 md:order-1 flex-1 min-w-0 w-full flex flex-col gap-sp40">
          <div className="flex flex-col gap-sp16">
            <h3 className="m-0 text-body-large font-medium text-neutral-800">
              Full Job Description
            </h3>
            {hasDescription ? (
              job.descriptionHtml ? (
                <div
                  className={`text-body-medium font-regular text-neutral-800 ${DESCRIPTION_HTML_CLASSES}`}
                  // descriptionHtml is sanitized server-side at scrape time (see
                  // server/scraper/sanitizeDescription.js) — this is the only place
                  // a job board's description is ever rendered as HTML.
                  dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
                />
              ) : (
                // Older/not-yet-rescraped jobs only have the stripped plain-text version —
                // no structure to recover, so it renders as a single paragraph. Gap: reported.
                <p className="m-0 text-body-medium font-regular text-neutral-800 leading-[20px]">
                  {job.descriptionText}
                </p>
              )
            ) : (
              <p className="m-0 text-body-medium font-regular text-neutral-500">
                No description was provided for this posting.
              </p>
            )}
          </div>
        </div>

        {/* Right column. Download Files first (Figma 2690:6611), shown in every state when the job has
            a document, then the score panel. The score panel is omitted entirely when there's no
            score, pay or stated years to show (no Figma state for that combination — simplest
            option). Reasoning and stated years aren't in the Figma panel; they reuse its existing
            text styles. */}
        {(hasSidebar || documents.length > 0) && (
          <div className="order-1 md:order-2 w-full md:w-[244px] lg:w-75 shrink-0 md:sticky md:top-sp24 flex flex-col gap-sp24">
            <DownloadFilesPanel jobId={job.id} documents={documents} panelRef={downloadPanelRef} />
            {hasSidebar && (
          <div className="w-full rounded-sm border border-primary-200 p-sp12 flex flex-col gap-sp24">
            {hasAi && (
              <>
                <div className="flex flex-col gap-sp12">
                  <div className="flex items-center gap-sp8">
                    <MatchScore percentage={job.ai.score} band={job.ai.band} />
                    {bandLabel && (
                      <span className={`text-body-large font-regular ${bandTextClass(job.ai.band)}`}>{bandLabel}</span>
                    )}
                  </div>
                  <p className="m-0 text-body-small font-regular text-neutral-700">{job.ai.reasoning}</p>
                </div>

                <div className="border-t border-neutral-100" />

                <div className="flex flex-col gap-sp16">
                  <span className="text-body-small font-medium text-neutral-500 uppercase tracking-wider">
                    Matching Role Highlights
                  </span>
                  <div className="flex flex-col gap-sp8">
                    {job.ai.highlights.map((highlight, i) => (
                      <div key={i} className="flex items-start gap-sp8">
                        <Check
                          size={18}
                          className="text-success-500 shrink-0 mt-[1px]"
                        />
                        <span className="text-body-small font-regular text-neutral-800">
                          {highlight}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {(compensationLabel || yearsLabel) && <div className="border-t border-neutral-100" />}
              </>
            )}

            {compensationLabel && (
              <div className="flex flex-col gap-sp8">
                <span className="text-body-small font-regular text-neutral-500 uppercase">
                  Compensation
                </span>
                <div className="flex flex-col">
                  <span className="text-body-medium font-medium text-neutral-800">
                    {compensationLabel}
                  </span>
                  <span className="text-body-small font-regular text-neutral-500">From the posting</span>
                </div>
              </div>
            )}

            {yearsLabel && (
              <div className="flex flex-col gap-sp8">
                <span className="text-body-small font-regular text-neutral-500 uppercase">
                  Years of experience
                </span>
                <div className="flex flex-col">
                  <span className="text-body-medium font-medium text-neutral-800">{yearsLabel}</span>
                  <span className="text-body-small font-regular text-neutral-500">From the posting</span>
                </div>
              </div>
            )}
          </div>
            )}
          </div>
        )}
      </div>

      {showDownloadTip && (
        <SpotlightOverlay
          key="download-files-tip"
          targetRef={downloadPanelRef}
          calloutText="Download the file(s) to apply for the job on the company’s portal."
          calloutActionText="Got it"
          calloutPosition="left"
          onDismiss={markDownloadFilesTipSeen}
        />
      )}
      {showMarkTip && (
        <SpotlightOverlay
          key="mark-applied-tip"
          targetRef={markButtonRef}
          calloutText="Click ‘Mark as applied’ to add this job listing in the Application Tracker"
          calloutActionText="Got it"
          calloutPosition="right"
          onDismiss={markMarkAppliedTipSeen}
        />
      )}
    </JobDetailLayout>
  );
}

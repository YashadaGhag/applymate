import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MainLayout from "../components/MainLayout";
import JobCard from "../components/JobCard/JobCard";
import CompanyJobGroup from "../components/CompanyJobGroup/CompanyJobGroup";
import Tabs from "../components/Tabs/Tabs";
import WatchlistEmptyState from "../components/WatchlistEmptyState";
import SpotlightOverlay from "../components/SpotlightOverlay/SpotlightOverlay";
import { ScoreNewResumeBanner, ScoreNewResumeModal } from "../components/ScoreNewResume";
import UpdateStatusBanner from "../components/UpdateStatusBanner";
import RefreshScoresBanner from "../components/RefreshScoresBanner";
import Toast from "../components/Toast";
import { useJobs } from "../hooks/useJobs";
import { useResumeScoring } from "../hooks/useResumeScoring";
import { useScoreRefresh } from "../hooks/useScoreRefresh";
import { useUpdateStatus } from "../hooks/useUpdateStatus";
import { useWatchlistLastViewed } from "../hooks/useWatchlistLastViewed";
import { useListMemory } from "../hooks/useListMemory";
import { clampPage, parsePage, withParams } from "../utils/listView";
import {
  shouldAnnounceNewJobs,
  failedRunKey,
  isFailedRunDismissed,
  readDismissedRun,
  writeDismissedRun,
} from "../utils/updateStatus";
import { useJobActions } from "../context/JobActionsContext";
import { useApplyNow } from "../hooks/useApplication";
import { relativeDuration } from "../../shared/jobFormatting.js";

const ITEMS_PER_PAGE = 5;
// Manage watchlist and the empty-state buttons (the onboarding /watchlist page is first-run setup only).
const WATCHLIST_TAB_PATH = "/preferences?tab=watchlist";

const filterGroups = (groups, isVisible) =>
  groups.map((group) => ({ ...group, jobs: group.jobs.filter(isVisible) }));

export default function JobRecommendationsPage() {
  const navigate = useNavigate();
  const customizeButtonRef = useRef(null);
  // The view (tab, and the page of each tab) is in the URL query, so a reload, the browser's back button and
  // the way back from Job Details keep it: /jobs?tab=others&op=2. Defaults (Watchlist, page 1) are left out.
  const [params, setParams] = useSearchParams();
  const updateView = (patch) => setParams((prev) => withParams(prev, patch, { tab: "watchlist", wp: 1, op: 1 }), { replace: true });
  const activeTab = params.get("tab") === "others" ? "others" : "watchlist";
  const setActiveTab = (tab) => updateView({ tab });
  const { isSaved, isDismissed, toggleSave, dismiss, dismissedVersion, showPendingDismissToast, showError, customizeTipSeen, markCustomizeTipSeen } =
    useJobActions();
  const applyNow = useApplyNow();
  // The Watchlist tab's red dot: last-viewed is set on the server when the person leaves this page.
  useWatchlistLastViewed();

  // ── Score new resume (Figma 2765:7168, 2766:1621, 2774:10286; banners 2766:2299, 2770:7883,
  // 2770:8447, 2770:8963). The status is read on load and polled every 5s only while running.
  const [scoringModal, setScoringModal] = useState(null); // null | "ready" | "running" | "failed"
  const scoring = useResumeScoring({
    // A run this page watched ended: an open "Scoring your jobs" dialog turns into the failed one
    // (or closes on done; the success banner below takes over).
    onFinished: (state) => setScoringModal((open) => (open === "running" ? (state === "failed" ? "failed" : null) : open)),
  });
  const scoringStatus = scoring.status;
  const { markDoneSeen } = scoring;

  // The "Rescore your jobs?" dialog shows for a ready new resume whose dialog wasn't shown yet
  // (Later and Score now set modalSeen). A reload or return mid-run shows the running banner, never
  // a dialog.
  const openModal = scoringModal ?? (scoringStatus?.state === "ready" && !scoringStatus.modalSeen ? "ready" : null);

  // Finished and not announced yet: the success banner for this visit. doneSeen is saved at once
  // (the local copy keeps saying unseen, so the banner stays until the page is left) and the list
  // refetches with the new scores (the refetch key below).
  const doneUnseen = scoringStatus?.state === "done" && scoringStatus.doneSeen === false;
  useEffect(() => {
    if (doneUnseen) markDoneSeen();
  }, [doneUnseen, markDoneSeen]);

  const startScoring = async ({ fromModal = false } = {}) => {
    const result = await scoring.start();
    if (result.ok) {
      if (fromModal) setScoringModal("running");
    } else {
      setScoringModal(null);
      showError(result.error);
    }
  };
  const closeReadyModal = () => {
    setScoringModal(null);
    scoring.markModalSeen();
  };
  const scoreNowFromModal = () => {
    setScoringModal("ready"); // stays open (Score now disabled) until the start request answers
    scoring.markModalSeen();
    startScoring({ fromModal: true });
  };

  const scoringState = scoringStatus?.state;
  const scoringBanner = openModal
    ? null
    : scoringState === "ready"
      ? scoringStatus.modalSeen
        ? "ready"
        : null
      : scoringState === "running" || scoringState === "failed"
        ? scoringState
        : doneUnseen
          ? "done"
          : null;

  // ── Refresh after a Details edit (Figma "Job Recommendations - Refresh after edit - Banner"). The
  // server says whether an edit left scores out of date (it survives a reload); the Score new resume
  // banner or dialog wins when either shows, since rescoring with a new resume already uses the
  // current details. When a refresh this page watched ends, the list refetches with the new scores.
  const [refreshRuns, setRefreshRuns] = useState(0);
  const scoreRefresh = useScoreRefresh({ onFinished: () => setRefreshRuns((n) => n + 1) });
  const refreshState = scoreRefresh.status?.state;
  const refreshBanner =
    !scoringBanner && !openModal && ["ready", "running", "failed"].includes(refreshState) ? refreshState : null;
  const refreshScores = async () => {
    const result = await scoreRefresh.start();
    if (!result.ok) showError(result.error);
  };

  // ── Daily background update (Figma running 2845:9862, failed 2846:13152, new jobs 2846:11354).
  // Read on load, polled every 5s only while running. When a run this page watched ends, the list
  // refetches (updateRuns) and, if it added jobs, the "New jobs added" toast shows. A run that
  // ended before the page opened shows nothing.
  const [updateRuns, setUpdateRuns] = useState(0);
  const [newJobsToast, setNewJobsToast] = useState(false);
  const { status: updateStatus } = useUpdateStatus({
    onFinished: (finished) => {
      setUpdateRuns((n) => n + 1);
      if (shouldAnnounceNewJobs(finished)) setNewJobsToast(true);
    },
  });
  const hideNewJobsToast = useCallback(() => setNewJobsToast(false), []);
  // The failed banner can be dismissed for that run only (remembered in this browser by the run's
  // finish time); a later failed run shows it again.
  const [dismissedRun, setDismissedRun] = useState(readDismissedRun);
  const dismissFailedRun = () => {
    const key = failedRunKey(updateStatus);
    if (key === null) return;
    setDismissedRun(key);
    writeDismissedRun(key);
  };
  const updateBanner =
    updateStatus?.state === "running" || (updateStatus?.state === "failed" && !isFailedRunDismissed(updateStatus, dismissedRun))
      ? updateStatus.state
      : null;

  // Refetches after each dismiss/restore reaches the server, so the next Others job moves up,
  // after a new resume's scores went live, and after a background update finished.
  const scoresKey = doneUnseen ? scoringStatus.finishedAt : "";
  const { watchlistGroups, others, lastUpdatedAt, hasNewWatchlistJobs, status } = useJobs(`${dismissedVersion}:${scoresKey}:${updateRuns}:${refreshRuns}`);

  // Scroll position and the groups opened with "See all N jobs" are put back when arriving by back, a reload
  // or a return link from Job Details (see useListMemory).
  const { expanded: expandedGroups, expandGroup } = useListMemory(status === "ready");

  // A dismiss from Job Details shows its toast only once this list has loaded without that job.
  useEffect(() => {
    if (status !== "ready") return;
    showPendingDismissToast(
      (jobId) =>
        others.some((job) => job.id === jobId) ||
        watchlistGroups.some((group) => group.jobs.some((job) => job.id === jobId))
    );
  }, [status, others, watchlistGroups, showPendingDismissToast]);

  // The server already leaves dismissed jobs out; this hides one at once, before the refetch.
  const isVisible = (job) => !isDismissed(job.id);
  const visibleWatchlistGroups = filterGroups(watchlistGroups, isVisible);
  const visibleOthers = others.filter(isVisible);

  const isWatchlistTab = activeTab === "watchlist";
  const pageKey = isWatchlistTab ? "wp" : "op";
  const storedPage = parsePage(params.get(pageKey));
  // A new page starts at the top, not wherever the pagination controls were.
  const goToPage = (page) => {
    updateView({ [pageKey]: page });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Only companies with matching roles are listed. Companies with no matching roles right now, or
  // no job source we can read, are simply left out (no empty company blocks, no notice).
  const watchlistJobGroups = visibleWatchlistGroups.filter((group) => !group.noSource && group.jobs.length > 0);

  // Watchlist tab empty states: no companies at all, or companies but no job passes.
  const watchlistEmptyVariant = !isWatchlistTab
    ? null
    : watchlistGroups.length === 0
      ? "zeroCompanies"
      : watchlistJobGroups.length === 0
        ? "noMatches"
        : null;

  // Watchlist paginates by company group; Others paginates by job card.
  const pagedList = isWatchlistTab ? watchlistJobGroups : visibleOthers;
  const totalPages = Math.max(1, Math.ceil(pagedList.length / ITEMS_PER_PAGE));
  // Derived so a shrinking list never leaves the page out of range: dismissing (or applying to) the last
  // job on a page lands on the previous page.
  const currentPage = clampPage(storedPage, pagedList.length, ITEMS_PER_PAGE);
  // Once the list has loaded, a page that no longer exists is corrected in the URL too.
  useEffect(() => {
    if (status === "ready" && currentPage !== storedPage) updateView({ [pageKey]: currentPage });
  });
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentItems = pagedList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const watchlistJobCount = watchlistJobGroups.reduce((sum, group) => sum + group.jobs.length, 0);
  const totalJobCount = isWatchlistTab ? watchlistJobCount : visibleOthers.length;
  const jobsBeforeCurrentPage = isWatchlistTab
    ? watchlistJobGroups.slice(0, startIndex).reduce((sum, group) => sum + group.jobs.length, 0)
    : startIndex;
  const currentJobCount = isWatchlistTab
    ? currentItems.reduce((sum, group) => sum + group.jobs.length, 0)
    : currentItems.length;
  const resultStart = totalJobCount === 0 ? 0 : jobsBeforeCurrentPage + 1;
  const resultEnd = jobsBeforeCurrentPage + currentJobCount;

  const firstCardId =
    currentPage === 1
      ? isWatchlistTab
        ? watchlistJobGroups[0]?.jobs[0]?.id
        : visibleOthers[0]?.id
      : undefined;

  const renderJobCard = (job, { showCompany = true } = {}) => (
    <JobCard
      key={job.id}
      id={job.id}
      title={job.title}
      company={job.company.name}
      companyDomain={job.company.domain}
      location={job.location}
      locationLead={job.locationLead}
      locationMore={job.locationMore}
      locations={job.locations}
      postedAt={job.postedAt}
      postedAtKind={job.postedAtKind}
      firstSeenAt={job.firstSeenAt}
      ai={job.ai}
      compensation={job.compensation}
      statedCompensation={job.statedCompensation}
      flagNoSponsorship={job.flagNoSponsorship}
      showCompany={showCompany}
      isSaved={isSaved(job.id)}
      onSave={() => toggleSave(job.id)}
      onCustomize={() => navigate(`/jobs/${encodeURIComponent(job.id)}/customize`)}
      customizeDisabled={Boolean(job.closed)}
      onApply={() => applyNow(job)}
      onDismiss={() => dismiss(job.id)}
      {...(job.id === firstCardId ? { customizeButtonRef } : {})}
    />
  );

  const items = isWatchlistTab
    ? currentItems.map((group) => (
        <CompanyJobGroup
          key={group.company.domain || group.company.name}
          company={group.company.name}
          companyDomain={group.company.domain}
          showAll={expandedGroups.has(group.company.domain || group.company.name)}
          onShowAll={() => expandGroup(group.company.domain || group.company.name)}
        >
          {group.jobs.map((job) => renderJobCard(job, { showCompany: false }))}
        </CompanyJobGroup>
      ))
    : currentItems.map((job) => renderJobCard(job));

  const itemsWithDividers = items.flatMap((item, i) =>
    i === 0 ? [item] : [<div key={`divider-${item.key}`} className="h-px w-full bg-neutral-100" />, item]
  );

  return (
    <MainLayout titleOffset activeItem="recommendations">
      {/* Header */}
      <div className="flex flex-col gap-sp16 md:flex-row md:items-center md:justify-between">
        <div>
          <h5 className="text-h5 font-medium text-neutral-800">Job Recommendations</h5>
          <p className="mt-sp8 text-body-small text-neutral-500">
            Showing your top matches, based on your profile. Updated {relativeDuration(lastUpdatedAt, { fine: true })}.
          </p>
        </div>
      </div>

      {/* Banner slot: Score new resume first, then Refresh after an edit, then the background update. */}
      {(scoringBanner || refreshBanner || updateBanner) && (
        <div className="mt-sp24 flex flex-col gap-sp8">
          {scoringBanner && (
            <ScoreNewResumeBanner
              place="jobs"
              state={scoringBanner}
              busy={scoring.starting}
              onScoreNow={() => startScoring()}
              onTryAgain={() => startScoring()}
            />
          )}
          {refreshBanner && (
            <RefreshScoresBanner state={refreshBanner} busy={scoreRefresh.starting} onRefresh={refreshScores} />
          )}
          {updateBanner && <UpdateStatusBanner state={updateBanner} onDismiss={dismissFailedRun} />}
        </div>
      )}

      {/* Tabs */}
      <div className="mt-sp24">
        <Tabs
          tabs={[
            {
              key: "watchlist",
              label: `Watchlist (${watchlistJobCount})`,
              showIndicator: hasNewWatchlistJobs,
            },
            { key: "others", label: `Others (${visibleOthers.length})` },
          ]}
          activeKey={activeTab}
          onChange={setActiveTab}
        />

        <div className="mt-sp8 flex flex-col items-start gap-sp16 md:flex-row md:items-center md:justify-between md:gap-0">
          <p className="text-body-small text-neutral-500">
            {isWatchlistTab
              ? "New roles from companies on your watchlist."
              : "More roles that match your profile and preferences."}
          </p>
          {isWatchlistTab && watchlistGroups.length > 0 && !watchlistEmptyVariant && (
            <button
              type="button"
              onClick={() => navigate(WATCHLIST_TAB_PATH)}
              className="border-none bg-transparent p-0 cursor-pointer text-body-medium font-medium text-primary-500 hover:underline"
            >
              Manage watchlist
            </button>
          )}
        </div>
      </div>

      {/* Job Cards */}
      {status === "loading" ? (
        // Simplest option for now — no designed loading state yet.
        <p className="mt-sp24 text-center text-body-medium text-neutral-500">Loading jobs…</p>
      ) : status === "error" ? (
        // Simplest option for now — no designed error state yet.
        <p className="mt-sp24 text-center text-body-medium text-neutral-500">
          Couldn't load jobs right now. Try refreshing the page.
        </p>
      ) : watchlistEmptyVariant ? (
        // Both buttons open Change Preferences > Company Watchlist.
        <div className="mt-sp40">
          <WatchlistEmptyState variant={watchlistEmptyVariant} onAction={() => navigate(WATCHLIST_TAB_PATH)} />
        </div>
      ) : (
        <>
          <div className="mt-sp24 flex flex-col gap-sp40">
            {itemsWithDividers}

            {currentItems.length === 0 && (
              // Not in Figma yet — simplest option. (The Watchlist tab has its own empty states.)
              <p className="py-sp40 text-center text-body-medium text-neutral-500">
                No other roles match your filters right now.
              </p>
            )}
          </div>

          {/* Pagination */}
          <div className="mt-sp24 flex items-center justify-between">
            <span className="text-body-small text-neutral-500">
              Results: {resultStart} - {resultEnd} of {totalJobCount}
            </span>
            <div className="flex items-center gap-sp16">
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="border-none bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed p-0"
              >
                <ChevronLeft size={20} className="text-neutral-500" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => goToPage(page)}
                  className={`border-none bg-transparent cursor-pointer p-0 text-body-small ${
                    page === currentPage
                      ? "font-bold text-neutral-800"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="border-none bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed p-0"
              >
                <ChevronRight size={20} className="text-neutral-500" />
              </button>
            </div>
          </div>
        </>
      )}

      {newJobsToast && <Toast variant="success" message="New jobs added" onHide={hideNewJobsToast} />}

      {openModal && (
        <ScoreNewResumeModal
          kind={openModal}
          busy={scoring.starting}
          onClose={openModal === "ready" ? closeReadyModal : () => setScoringModal(null)}
          onConfirm={openModal === "ready" ? scoreNowFromModal : () => startScoring({ fromModal: true })}
        />
      )}

      {/* One-time tip: shown until it is dismissed once, ever (userState.customizeTipSeenAt). */}
      {customizeTipSeen === false && !openModal && status === "ready" && firstCardId && (
        <SpotlightOverlay
          targetRef={customizeButtonRef}
          calloutText="Customizing resume for each application increases the chances of selection."
          calloutActionText="Got it"
          calloutPosition="left"
          onDismiss={markCustomizeTipSeen}
        />
      )}
    </MainLayout>
  );
}

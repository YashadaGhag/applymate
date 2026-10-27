import { Router } from "express";
import { getUpdateStatus } from "../scheduler/scheduler.js";
import { readOverride, overrideStatus } from "../dev/updateStateOverride.js";
import { watchlistProgress } from "../scheduler/watchlistProgress.js";
import { backgroundWorkEnabled } from "../scheduler/trigger.js";
import { getState, getJobsStore, getScoresStore, getResumesStore, getSchedulerStore } from "../store/store.js";

const router = Router();

/**
 * GET /api/jobs/update-status
 * { state: "idle" | "running" | "failed", phase: "scraping" | "scoring" | null, startedAt, finishedAt,
 *   outcome: "done" | "failed" | null, failedPhase, newJobs, message }
 * The daily scheduler's last run (see server/scheduler/scheduler.js). "running" only while this
 * process holds the run lock for a scheduled run. newJobs = jobs the last run scored at 50 or
 * more (newly visible). A GET only: starts nothing, no AI call. Mounted before the jobs router so
 * "/jobs/:id" doesn't take it.
 *
 * `?watchlist=1` adds `watchlist: { enabled, total, waiting, scraped, notChecked: [{ id, name }],
 * rolesFound, companiesWithRoles, scoringFailed }` for the onboarding loader after Save (see
 * server/scheduler/watchlistProgress.js). Still a read: computed from stored data, nothing runs.
 *
 * DEV ONLY: `npm run dev:update-state` can leave a pretend state (server/dev); it is used only while
 * no real run is going on, never over one.
 */
router.get("/jobs/update-status", (req, res) => {
  const real = getUpdateStatus();
  const status = (real.state !== "running" && overrideStatus(readOverride())) || real;
  if (req.query.watchlist !== "1") return res.json(status);
  const state = getState();
  res.json({
    ...status,
    watchlist: watchlistProgress({
      watchlist: state.watchlist,
      companyMeta: state.companyMeta,
      jobs: getJobsStore().jobs,
      scores: getScoresStore().scores,
      resumeVersion: getResumesStore().currentVersion,
      enabled: backgroundWorkEnabled(),
      lastRun: getSchedulerStore().lastRun,
    }),
  });
});

export default router;

import { Router } from "express";
import { getRefreshStatus, startRefresh, RefreshError } from "../ai/refreshScores.js";

const router = Router();

function replyError(res, err) {
  if (err instanceof RefreshError) return res.status(err.status).json({ error: err.code, message: err.message });
  console.warn(`[refresh-scores] ${err.message}`);
  res.status(500).json({ error: "internal", message: "Couldn't refresh your scores." });
}

/**
 * GET /api/scoring/refresh
 * { state: "none" | "ready" | "running" | "failed", needed, startedAt, finishedAt, calls, message }
 * Whether a Details edit left scores out of date (stale years, newly eligible jobs) and the page
 * should offer Refresh. Read from the server, so it survives a reload. Never a call; safe to poll.
 * "none" also while a Score new resume run is waiting, running or failed (it covers this).
 */
router.get("/scoring/refresh", async (req, res) => {
  try {
    res.json(await getRefreshStatus());
  } catch (err) {
    replyError(res, err);
  }
});

/**
 * POST /api/scoring/refresh/start
 * The person's click on Refresh or Try again: scores the eligible jobs that have no current score
 * (Sonnet, the scoring cache, the prefilter, the same run lock and 150-call ceiling as every run;
 * another approved click that starts scoring, like Score now). { state: "running", startedAt } at
 * once; the run goes on if the page closes. 409 already running or nothing to refresh.
 */
router.post("/scoring/refresh/start", async (req, res) => {
  try {
    const { finished, ...body } = await startRefresh(); // the route never waits for the run
    finished.catch(() => {});
    res.json(body);
  } catch (err) {
    replyError(res, err);
  }
});

export default router;

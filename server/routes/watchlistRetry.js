import { Router } from "express";
import { requestCompanyRetry } from "../scheduler/trigger.js";

const router = Router();

/**
 * POST /api/watchlist/retry
 * Try again on the onboarding loader after Save. Clears the waiting backoff of the companies that
 * failed and starts the same background work as a watchlist save (detect, scrape, score), now.
 * Answers 202 at once: { accepted, running?, reason? }. `running: true` means a run is already
 * going (this process or another one holds the run lock), so repeated clicks start nothing extra.
 * { accepted: false } when background work is off (APPLYMATE_SCHEDULER=off). The body is ignored.
 * No retries inside a run, the same 150-call ceiling and cache as every scoring run.
 */
router.post("/watchlist/retry", (req, res) => {
  res.status(202).json(requestCompanyRetry());
});

export default router;

import { Router } from "express";
import { requestOthersStart } from "../scheduler/trigger.js";

const router = Router();

/**
 * POST /api/onboarding/start-others
 * The Role page's Continue sends this (and nothing else does: a profile save, a page load or a GET
 * never starts it). Records the request and answers 202 at once; the Others scrape (only when not
 * done since the last 9:00 AM Pacific) and the scoring of the Others jobs that pass the prefilter
 * run in the background (server/scheduler/scheduler.js). The body is ignored. The page must not
 * wait for it. { accepted: false, reason } when nothing was started (the scheduler is off, or
 * setup is not complete).
 */
router.post("/onboarding/start-others", (req, res) => {
  res.status(202).json(requestOthersStart());
});

export default router;

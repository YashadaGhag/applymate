import express, { Router } from "express";
import { getSavedLetter, startCoverLetter, CoverLetterRequestError } from "../ai/runCoverLetter.js";

const router = Router();

// The POST body is no longer used (an old client may still send { resumeText }; it is ignored).
// The resume source is resolved on the server by job id.
const json = express.json({ limit: "256kb" });

/**
 * GET /api/jobs/:id/cover-letter
 * Returns { coverLetter: letter | null, inFlight, styleChanged, resumeChanged } for the most
 * recent letter for this job. Never makes a call.
 */
router.get("/jobs/:id/cover-letter", (req, res) => {
  const { letter, inFlight, styleChanged = false, resumeChanged = null } = getSavedLetter(req.params.id);
  res.json({ coverLetter: letter, inFlight, styleChanged, resumeChanged });
});

/**
 * POST /api/jobs/:id/cover-letter
 * No body needed. The resume source is resolved on the server by job id: the SAVED edited resume
 * for this job (text derived from its sanitized HTML), else the saved tailored draft, else the base
 * resume. A `resumeText` in the body is accepted and ignored.
 * Triggered only by the user's click. Responds with NDJSON (application/x-ndjson), one event per line:
 *   { type: "start", jobId, cached, coverLetterVersion, resumeSource }
 *   { type: "block_start", index, kind }      kind: header | greeting | paragraph | signoff
 *   { type: "block", index, block }           header and greeting (code) come first, at once
 *   { type: "thinking" }                      the model has started
 *   { type: "plan", paragraphs, items, achievements }
 *                                             how many body paragraphs, one line on each, and
 *                                             the 2 or 3 resume achievements the letter uses
 *   { type: "block_start" | "block" }         each body paragraph (kind "paragraph"), then the
 *                                             sign-off (code)
 *   { type: "blocks_done" }
 *   { type: "check", verified, newItems }     plain-code "nothing added" check
 *   { type: "done", letter }                  the saved letter (also the only event after start
 *                                             when a letter with the same inputs was saved)
 *   { type: "error", message, detail }        nothing saved; no automatic retry
 *
 * One call in flight per job: a second click joins it (replays the events so far, then follows).
 * Closing the connection doesn't stop the call; the letter is still saved.
 * 404 unknown job; 409 closed job or no resume (plain JSON, before any streaming).
 */
router.post("/jobs/:id/cover-letter", json, (req, res) => {
  let outcome;
  try {
    outcome = startCoverLetter(req.params.id);
  } catch (err) {
    if (err instanceof CoverLetterRequestError) return res.status(err.status).json({ error: err.code, message: err.message });
    throw err;
  }

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  const write = (event) => res.write(JSON.stringify(event) + "\n");

  if (outcome.status === "cached") {
    const { letter } = outcome;
    write({ type: "start", jobId: req.params.id, cached: true, coverLetterVersion: letter.coverLetterVersion, resumeSource: letter.resumeSource });
    write({ type: "done", letter });
    return res.end();
  }

  const unsubscribe = outcome.run.subscribe((event) => {
    if (res.writableEnded) return;
    write(event);
    if (event.type === "done" || event.type === "error") res.end();
  });
  res.on("close", unsubscribe);
});

export default router;

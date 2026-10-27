import { Router } from "express";
import { getSavedDraft, startTailoring, TailoringRequestError } from "../ai/runTailoring.js";

const router = Router();

/**
 * GET /api/jobs/:id/tailoring
 * Returns { tailoring: draft | null, inFlight } for this job and the current resume version.
 * Never makes a call: opening Customize Application uses this to show a saved draft at once.
 */
router.get("/jobs/:id/tailoring", (req, res) => {
  const { draft, inFlight } = getSavedDraft(req.params.id);
  res.json({ tailoring: draft, inFlight });
});

/**
 * POST /api/jobs/:id/tailor
 * Triggered only by the user's click. Responds with NDJSON (application/x-ndjson): one JSON event
 * per line, read with fetch + a stream reader.
 *   { type: "start", jobId, cached, tailoringVersion }
 *   { type: "thinking" }                          the model has started (no section yet)
 *   { type: "plan", items }                       the sections about to be written, in order
 *                                                 ({ kind, section, title })
 *   { type: "block_start", index, kind, section, title }
 *                                                 a section is being written (title: the role's
 *                                                 title for a role, else null)
 *   { type: "block", index, block }               that section, complete
 *   { type: "blocks_done" }                       all sections done; gaps are being written
 *   { type: "gaps", items }                       Gap to review ({ requirement, quote, text })
 *   { type: "changes", items }                    What changed (built in code from a comparison
 *                                                 with the resume, after the draft is complete)
 *   { type: "check", verified, newItems }         plain-code "nothing added" check
 *   { type: "done", draft }                       the saved draft (also the only event after
 *                                                 start when the draft was already saved)
 *   { type: "error", message, detail }            nothing saved; no automatic retry
 *
 * A saved draft is returned with no call. A second click while a call is running joins it
 * (replays the events so far, then follows); it never starts another. Closing the connection
 * doesn't stop the call: the draft is still saved, so reopening the job shows it.
 * 404 unknown job; 409 closed job or no resume (plain JSON, before any streaming).
 */
router.post("/jobs/:id/tailor", (req, res) => {
  let outcome;
  try {
    outcome = startTailoring(req.params.id);
  } catch (err) {
    if (err instanceof TailoringRequestError) return res.status(err.status).json({ error: err.code, message: err.message });
    throw err;
  }

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  const write = (event) => res.write(JSON.stringify(event) + "\n");

  if (outcome.status === "cached") {
    write({ type: "start", jobId: req.params.id, cached: true, tailoringVersion: outcome.draft.tailoringVersion });
    write({ type: "done", draft: outcome.draft });
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

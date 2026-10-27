import express, { Router } from "express";
import { getJobsStore } from "../store/store.js";
import { TABS, getEdited, saveEdited } from "../edited/editedDocuments.js";
import { MAX_EDITED_HTML_CHARS, sanitizeEditedHtml } from "../edited/sanitizeEdited.js";
import { editedHtmlToText } from "../edited/htmlToText.js";

const router = Router();

// Own parser (about 256kb), so this router is mounted before the app-wide express.json().
const json = express.json({ limit: "256kb" });

const jobExists = (jobId) => getJobsStore().jobs.some((j) => j.id === jobId);

/**
 * GET /api/jobs/:id/edited?tab=resume|cover
 * { edited: { html, savedAt } | null } for the CURRENT draft (resume) or latest letter (cover).
 * No call of any kind. 400 bad tab; 404 unknown job.
 */
router.get("/jobs/:id/edited", (req, res) => {
  const tab = req.query.tab;
  if (!TABS.includes(tab)) return res.status(400).json({ error: "bad_tab" });
  if (!jobExists(req.params.id)) return res.status(404).json({ error: "not_found" });
  res.json({ edited: getEdited(req.params.id, tab) });
});

/**
 * PUT /api/jobs/:id/edited   body { tab, html }
 * Saves the edited document for this job and tab, overwriting the previous save. The HTML is
 * sanitized here (server/edited/sanitizeEdited.js) and only the sanitized copy is stored and
 * returned. The generated draft or letter is never modified.
 * 400 bad body (tab, html not a string, too long, nothing left after sanitizing); 404 unknown job;
 * 409 when there is no draft or letter to attach the edit to.
 */
router.put("/jobs/:id/edited", json, (req, res) => {
  const { tab, html } = req.body ?? {};
  if (!TABS.includes(tab)) return res.status(400).json({ error: "bad_tab" });
  if (typeof html !== "string") return res.status(400).json({ error: "bad_html" });
  if (html.length > MAX_EDITED_HTML_CHARS) return res.status(400).json({ error: "too_long" });
  const clean = sanitizeEditedHtml(html);
  if (!editedHtmlToText(clean)) return res.status(400).json({ error: "empty" });
  if (!jobExists(req.params.id)) return res.status(404).json({ error: "not_found" });

  const edited = saveEdited(req.params.id, tab, clean);
  if (!edited) return res.status(409).json({ error: "nothing_to_edit" });
  res.json({ edited });
});

export default router;

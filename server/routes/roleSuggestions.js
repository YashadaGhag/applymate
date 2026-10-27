import { Router } from "express";
import fs from "node:fs";
import { getJobsStore } from "../store/store.js";
import { rankTitles, mergeSuggestions } from "../roles/roleTitles.js";

const router = Router();

const snapshot = JSON.parse(fs.readFileSync(new URL("../roles/roleTitles.json", import.meta.url), "utf8")).titles;

/**
 * GET /api/roles/suggestions?q=<typed text>
 * Designation suggestions: titles seen at 2+ companies (or in 5+ jobs) in the person's own scraped jobs (counted live
 * from jobs.json, most jobs first), then the bundled snapshot (server/roles/roleTitles.json), deduped
 * case-insensitively, typed text matched at the start of any word and ranked by job count, about 10. With no jobs, the snapshot only.
 * The roles from the resume are added by the client. Read only: no scrape, no AI call.
 * Returns { suggestions: [{ title, source: "live" | "snapshot" }] }.
 */
router.get("/suggestions", (req, res) => {
  const q = String(req.query.q ?? "").slice(0, 100);
  const live = rankTitles(getJobsStore().jobs ?? []).map(({ title, jobs }) => ({ title, jobs }));
  res.json({ suggestions: mergeSuggestions({ live, snapshot, query: q }) });
});

export default router;

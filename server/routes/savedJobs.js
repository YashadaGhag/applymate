import { Router } from "express";
import { getJobsStore, getState } from "../store/store.js";
import { cleanLocation, derivedFields, requestContext } from "./jobs.js";
import { formatCompensation } from "../../shared/jobFormatting.js";

const router = Router();

/**
 * GET /api/saved-jobs
 * { savedJobs: [...] }: every saved job still in jobs.json (saved jobs are exempt from the scrape
 * purges), newest saved first, in the light job shape: id, source, company, title, location,
 * workMode, compensation (display text or null), closed, applyUrl, score (the current rounded score
 * for the current resume, only when cards show it, else null) and savedAt (null for a job saved
 * before dates were kept). No description, no call of any kind.
 */
router.get("/saved-jobs", (req, res) => {
  const state = getState();
  const ctx = requestContext(state);
  const savedAt = state.userState?.savedAt ?? {};
  const byId = new Map(getJobsStore().jobs.map((j) => [j.id, j]));

  const savedJobs = (state.userState?.savedJobIds ?? [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((job) => {
      const derived = derivedFields(job, ctx);
      return {
        id: job.id,
        source: job.source ?? null,
        company: { name: job.company?.name ?? null, domain: job.company?.domain ?? null },
        title: job.title ?? null,
        location: cleanLocation(job.location) ?? null,
        workMode: job.workMode ?? null,
        compensation: formatCompensation(job.compensation ?? derived.statedCompensation) ?? null,
        closed: Boolean(job.closed),
        applyUrl: job.applyUrl ?? null,
        score: derived.ai?.score ?? null,
        savedAt: savedAt[job.id] ?? null,
      };
    })
    .sort((a, b) => {
      if (!a.savedAt || !b.savedAt) return Number(!a.savedAt) - Number(!b.savedAt);
      return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    });

  res.json({ savedJobs });
});

export default router;

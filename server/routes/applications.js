import { Router } from "express";
import { getJobsStore, getState, getApplicationsStore, updateApplicationsStore } from "../store/store.js";
import { canArchive, canChangeStatus, isStatus } from "../applications/status.js";
import { cleanLocation, derivedFields, requestContext } from "./jobs.js";
import { formatCompensation } from "../../shared/jobFormatting.js";

const router = Router();

// The job as it was when the record was created, so Tracker rows survive the job closing, aging
// past 60 days or its company leaving the watchlist. Null for anything unknown, never a guess.
function snapshotOf(job, derived) {
  return {
    company: { name: job.company?.name ?? null, domain: job.company?.domain ?? null },
    companyId: job.company?.id ?? null,
    title: job.title ?? null,
    location: cleanLocation(job.location) ?? null,
    // Display text, same rule as the cards: the ATS's range, else the range read from the posting.
    compensation: formatCompensation(job.compensation ?? derived.statedCompensation) ?? null,
    applyUrl: job.applyUrl ?? null,
    source: job.source ?? null,
  };
}

function findJob(jobId) {
  return getJobsStore().jobs.find((j) => j.id === jobId) ?? null;
}

function recordFor(jobId) {
  return getApplicationsStore().applications[jobId] ?? null;
}

/**
 * GET /api/applications
 * { applications: [...] }, every record, newest first. Records are already light (a snapshot of the
 * job, never its description).
 */
router.get("/applications", (req, res) => {
  const applications = Object.values(getApplicationsStore().applications).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ applications });
});

/** GET /api/applications/:jobId → { application } or { application: null }. */
router.get("/applications/:jobId", (req, res) => {
  res.json({ application: recordFor(req.params.jobId) });
});

/**
 * POST /api/applications/:jobId/pending
 * Idempotent. Creates the pending record with a snapshot of the job; when any record exists it is
 * returned unchanged (a job already applied to never goes back to pending). 404 unknown job, 409
 * closed job. No AI call.
 */
router.post("/applications/:jobId/pending", (req, res) => {
  const { jobId } = req.params;
  const existing = recordFor(jobId);
  if (existing) return res.json({ application: existing });

  const job = findJob(jobId);
  if (!job) return res.status(404).json({ error: "not_found" });
  if (job.closed) return res.status(409).json({ error: "closed_job" });

  const now = new Date().toISOString();
  const record = {
    jobId,
    status: "pending",
    archived: false,
    statusHistory: [{ status: "pending", at: now }],
    createdAt: now,
    appliedAt: null,
    scoreAtApply: null,
    job: snapshotOf(job, derivedFields(job, requestContext(getState()))),
  };
  updateApplicationsStore((s) => ({ ...s, applications: { ...s.applications, [jobId]: record } }));
  res.status(201).json({ application: record });
});

/**
 * PUT /api/applications/:jobId/status   body { status }
 * 400 for a status that isn't one of the five; 404 with no record; 409 for a change that isn't
 * allowed (see server/applications/status.js). pending → applied sets appliedAt and scoreAtApply,
 * the job's current rounded score for the current resume as shown on screen, else null.
 * applied → pending (the revert, for a job marked applied by mistake) clears both, so the row reads
 * like any pending one and a later Mark as applied stamps them afresh. The job snapshot, createdAt
 * and the history are kept (the history gets a pending entry); tailored resumes and cover letters
 * are separate files and never touched.
 */
router.put("/applications/:jobId/status", (req, res) => {
  const { jobId } = req.params;
  const status = req.body?.status;
  if (!isStatus(status)) return res.status(400).json({ error: "bad_status" });

  const record = recordFor(jobId);
  if (!record) return res.status(404).json({ error: "not_found" });
  if (!canChangeStatus(record.status, status)) {
    return res.status(409).json({ error: "change_not_allowed", from: record.status, to: status });
  }

  const now = new Date().toISOString();
  const next = { ...record, status, statusHistory: [...record.statusHistory, { status, at: now }] };
  if (record.status === "pending" && status === "applied") {
    const job = findJob(jobId);
    next.appliedAt = now;
    next.scoreAtApply = job ? derivedFields(job, requestContext(getState())).ai?.score ?? null : null;
  }
  if (record.status === "applied" && status === "pending") {
    next.appliedAt = null;
    next.scoreAtApply = null;
  }
  updateApplicationsStore((s) => ({ ...s, applications: { ...s.applications, [jobId]: next } }));
  res.json({ application: next });
});

/**
 * PUT /api/applications/:jobId/archive
 * Allowed from interviewing, offer and not_moving_forward only (409 otherwise); 404 with no record.
 * Already archived: returned unchanged. There is no unarchive.
 */
router.put("/applications/:jobId/archive", (req, res) => {
  const { jobId } = req.params;
  const record = recordFor(jobId);
  if (!record) return res.status(404).json({ error: "not_found" });
  if (!canArchive(record.status)) return res.status(409).json({ error: "change_not_allowed", from: record.status });
  if (record.archived) return res.json({ application: record });

  const next = { ...record, archived: true };
  updateApplicationsStore((s) => ({ ...s, applications: { ...s.applications, [jobId]: next } }));
  res.json({ application: next });
});

export default router;

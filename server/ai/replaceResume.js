import { createHash } from "node:crypto";
import {
  getState,
  updateState,
  getResumesStore,
  updateResumesStore,
  updateScoresStore,
  saveResumeFile,
  deleteResumeFile,
  appendAiUsage,
} from "../store/store.js";
import { acquireRunLock, currentRunHolder } from "../store/runLock.js";
import { extractResumeContent } from "../resume/extractText.js";
import { extractResumeFields, EXTRACTION_VERSION } from "./extractResume.js";
import { chipAppearsInTitle } from "../scraper/filterJobs.js";
import { resolveLocation } from "../geo/cities.js";
import { scoreJobs, DEFAULT_MAX_CALLS } from "./runScoring.js";
import { validateProfilePatch, mergeProfile } from "./profilePatch.js";

// Change Preferences > Resume: replacing the resume without losing the job search.
//
//   prepareReplacement   a file is uploaded: read it, extract (one Haiku call, cached), store it as
//                        a PENDING replacement, run the plain-code mismatch check. Nothing active
//                        changes.
//   confirmReplacement   save the optional profile edits (Confirm details). The new resume then
//                        waits in "ready". Nothing is scored, nothing active changes.
//   startScoring         the person's click on "Score now" / "Try again": score the new resume over
//                        every job that passes the prefilter (Sonnet, the approved exception to
//                        "scoring never runs from a route"). Returns at once; the run goes on.
//   activate             only after every job is scored: the new resume becomes active, all at once.
//
// The old resume stays the active one everywhere until then; if anything fails before the switch
// nothing changes for the user, and a retry reuses the scores already made. Saved tailored drafts
// and cover letters are never touched (they are keyed by resume version / text hash).
//
// Record states (resumes.json → replacement.state): needs_confirmation → ready → running →
// done | failed (failed → running again on Try again). The record also holds the last run's
// startedAt, finishedAt and calls, and two UI flags: modalSeen (the "Rescore your jobs?" dialog was
// shown and closed or acted on) and doneSeen (the success banner was shown once). A new upload
// makes a new record, so both flags start over.

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
// The profile's years and the new resume's differ by at least this much: ask first.
export const YEARS_DIFFERENCE_TO_CONFIRM = 2;

export class ReplaceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const extensionOf = (fileName) => ACCEPTED_EXTENSIONS.find((ext) => fileName.toLowerCase().endsWith(ext)) ?? null;

// ─── The mismatch check (plain code, no AI, no network) ───────────────────────────────────────

function cityRegion(text) {
  const resolved = resolveLocation(text);
  if (resolved?.city) return { city: resolved.city.toLowerCase(), region: resolved.region ? resolved.region.toLowerCase() : null };
  const parts = String(text).split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  return { city: parts[0] ?? null, region: parts[1] ?? null };
}

/**
 * Whether the new resume looks different enough from what the search was set up for to ask first.
 * Pure: inputs are the saved profile and the two extractions' fields. Only values that were
 * actually extracted count: a missing value on either side is never a reason.
 *   years        the new resume's computed years differ from the profile's by 2 or more.
 *   designation  none of the profile's designation chips appears (the prefilter's phrase rule,
 *                level words ignored) in the new designation or adjacent roles.
 *   location     the new resume's HEADER location differs from the old resume's header location at
 *                city or region level. Never compared with the profile's desired locations.
 * Returns { reasons: [{ code, message }], needsConfirmation }.
 */
export function checkMismatch({ profile, oldFields, newFields }) {
  const reasons = [];

  const profileYears = profile?.yearsOfExperience;
  const newYears = newFields?.yearsOfExperience;
  if (Number.isInteger(profileYears) && Number.isInteger(newYears) && Math.abs(newYears - profileYears) >= YEARS_DIFFERENCE_TO_CONFIRM) {
    reasons.push({
      code: "years",
      message: `The new resume adds up to ${newYears} years of experience; your profile says ${profileYears}.`,
    });
  }

  const chips = (profile?.roles ?? []).filter((r) => typeof r === "string" && r.trim());
  const newRoles = [newFields?.designation, ...(newFields?.adjacentRoles ?? [])].filter(Boolean);
  if (chips.length > 0 && newRoles.length > 0 && !chips.some((chip) => newRoles.some((role) => chipAppearsInTitle(chip, role)))) {
    reasons.push({
      code: "designation",
      message: "None of your designations appears in the new resume's job title or related roles.",
    });
  }

  const oldLocation = oldFields?.location;
  const newLocation = newFields?.location;
  if (oldLocation && newLocation) {
    const a = cityRegion(oldLocation);
    const b = cityRegion(newLocation);
    const differs = a.city !== b.city || (a.region && b.region && a.region !== b.region);
    if (differs) {
      reasons.push({
        code: "location",
        message: `The new resume's header says ${newLocation}; the old one said ${oldLocation}.`,
      });
    }
  }

  return { reasons, needsConfirmation: reasons.length > 0 };
}

// ─── The replacement record (data/resumes.json → replacement) ────────────────────────────────

let runInProgress = false;
// Scoring calls made so far by the run in this process (shown by GET /api/resume/scoring while it runs).
let liveCalls = 0;

function getReplacement() {
  const store = getResumesStore();
  const record = store.replacement;
  // A record left "running" by a process that is gone (the server restarted mid-run) can't finish
  // by itself: it becomes "failed", so the page offers a retry (which reuses the scores made).
  // A live process holding the replace lock (the dev state script) is still on it.
  if (record?.state === "running" && !runInProgress && currentRunHolder()?.kind !== "replace-resume") {
    const failed = { ...record, state: "failed", finishedAt: new Date().toISOString(), message: "The run was interrupted (the server restarted). Retry to continue; scores already made are kept." };
    updateResumesStore((s) => ({ ...s, replacement: failed }));
    return failed;
  }
  return record;
}

function setReplacement(next) {
  updateResumesStore((s) => ({ ...s, replacement: next }));
  return next;
}

const profileSnapshot = (profile) => ({
  designation: Array.isArray(profile?.roles) ? profile.roles : [],
  years: Number.isInteger(profile?.yearsOfExperience) ? profile.yearsOfExperience : null,
  locations: (profile?.locations ?? []).map((l) => (typeof l === "string" ? l : l?.label)).filter(Boolean),
});

const resumeSnapshot = (fields) => ({
  designation: fields?.designation ?? null,
  adjacentRoles: fields?.adjacentRoles ?? [],
  years: Number.isInteger(fields?.yearsOfExperience) ? fields.yearsOfExperience : null,
  headerLocation: fields?.location ?? null,
});

/** Current state for GET /api/resume/replace. */
export function getReplacementStatus() {
  const r = getReplacement();
  if (!r) return { state: "idle" };
  const base = { state: r.state, fileName: r.fileName };
  if (r.state === "ready" || r.state === "needs_confirmation") {
    return { ...base, ...(r.reasons?.length ? { reasons: r.reasons } : {}), current: r.current, fromResume: r.fromResume };
  }
  if (r.state === "failed") {
    return { ...base, message: r.message, ...(r.reasons?.length ? { reasons: r.reasons } : {}), current: r.current, fromResume: r.fromResume };
  }
  if (r.state === "running") return { ...base, startedAt: r.startedAt };
  return { ...base, finishedAt: r.finishedAt }; // done
}

/**
 * Called once when the API starts. A replacement left "running" by a server that died can never
 * finish by itself, and nothing in this process is running it: unless a live process still holds
 * the replace lock, mark it failed so the page shows a retry instead of spinning forever.
 * Returns true when it changed a record.
 */
export function recoverInterruptedReplacement() {
  const record = getResumesStore().replacement;
  if (record?.state !== "running") return false;
  const holder = currentRunHolder();
  if (holder?.kind === "replace-resume") return false; // another live process is on it
  setReplacement({
    ...record,
    state: "failed",
    message: "The run was interrupted (the server restarted). Retry to continue; scores already made are kept.",
    finishedAt: new Date().toISOString(),
  });
  return true;
}

// ─── Step 1: upload ──────────────────────────────────────────────────────────────────────────

/**
 * Reads the uploaded file and sets it up as the pending replacement. Returns
 * { status: "same_file" | "ready" | "needs_confirmation", fileName, cached?, reasons?, current?, fromResume? }.
 * Throws ReplaceError for a bad file, a run in progress, or a failed extraction (nothing pending,
 * the old resume stays). At most one call (the extraction), none for a file already extracted at
 * the current EXTRACTION_VERSION or the same file as the active resume.
 */
export async function prepareReplacement({ buffer, fileName }) {
  // First, before anything else (even the same-file answer): no replace while the new resume is
  // being scored. The Resume tab disables Replace file then; this is the server enforcing it.
  if (getReplacement()?.state === "running") {
    throw new ReplaceError(409, "run_in_progress", "Your new resume is being scored. You can replace the file when it finishes.");
  }

  const extension = extensionOf(fileName);
  if (!extension) throw new ReplaceError(400, "unsupported_file", "Unsupported file format. Please upload a PDF or DOCX.");
  if (buffer.length > MAX_FILE_SIZE) throw new ReplaceError(400, "too_large", "File exceeds 25MB limit.");

  const resumeVersion = sha256(buffer);
  const resumes = getResumesStore();
  const activeVersion = resumes.currentVersion;

  // The same file as the active resume: nothing to replace. Keep its original file if it has none yet.
  if (resumeVersion === activeVersion) {
    const active = resumes.versions[activeVersion];
    if (active && !active.storedAs) {
      const storedAs = saveResumeFile(buffer, resumeVersion, extension);
      updateResumesStore((s) => ({ ...s, versions: { ...s.versions, [activeVersion]: { ...s.versions[activeVersion], storedAs } } }));
    }
    return { status: "same_file", fileName };
  }

  // Extraction: the stored one when it's current (no call), otherwise one Haiku call.
  const existing = resumes.versions[resumeVersion];
  let version;
  let cached = false;
  if (existing?.extraction?.extractionVersion === EXTRACTION_VERSION && existing.text) {
    version = existing;
    cached = true;
  } else {
    let text;
    let links;
    let extracted;
    try {
      ({ text, links } = await extractResumeContent(buffer, fileName));
      if (!text) throw new Error("No text found in the file (it may be a scanned image).");
      extracted = await extractResumeFields(text, { links, resumeVersion });
    } catch (err) {
      console.warn(`[replace-resume] ${fileName}: ${err.message}`);
      throw new ReplaceError(422, "extraction_failed", `Couldn't read that resume: ${err.message}`);
    }
    const { model, extractionVersion, ...fields } = extracted;
    version = {
      version: resumeVersion,
      uploadedAt: existing?.uploadedAt ?? new Date().toISOString(),
      fileName,
      text,
      links,
      extraction: { fields, model, extractionVersion, extractedAt: new Date().toISOString() },
    };
  }

  // Only now (extraction worked) does anything change on disk. A previous pending replacement of a
  // different file is dropped; its original file goes with it.
  const previous = resumes.replacement;
  const storedAs = saveResumeFile(buffer, resumeVersion, extension);
  if (previous?.version && previous.version !== resumeVersion && previous.version !== activeVersion) {
    deleteResumeFile(resumes.versions[previous.version]?.storedAs);
  }

  const profile = getState().profile;
  const oldFields = resumes.versions[activeVersion]?.extraction?.fields ?? null;
  const newFields = version.extraction.fields;
  const { reasons, needsConfirmation } = checkMismatch({ profile, oldFields, newFields });
  const current = profileSnapshot(profile);
  const fromResume = resumeSnapshot(newFields);

  updateResumesStore((s) => {
    const versions = { ...s.versions, [resumeVersion]: { ...version, fileName, storedAs } };
    if (previous?.version && previous.version !== resumeVersion && previous.version !== activeVersion) delete versions[previous.version];
    return {
      ...s,
      versions,
      replacement: {
        state: needsConfirmation ? "needs_confirmation" : "ready",
        version: resumeVersion,
        fileName,
        reasons,
        current,
        fromResume,
        createdAt: new Date().toISOString(),
      },
    };
  });
  // Scores of a previously pending, different resume don't belong to this one.
  updateScoresStore((s) => (s.pending && s.pending.resumeVersion !== resumeVersion ? { ...s, pending: null } : s));

  return {
    status: needsConfirmation ? "needs_confirmation" : "ready",
    fileName,
    cached,
    ...(needsConfirmation ? { reasons } : {}),
    current,
    fromResume,
  };
}

// ─── Step 2: confirm ─────────────────────────────────────────────────────────────────────────

/**
 * Saves the optional Confirm details edits and leaves the new resume waiting in "ready". Starts
 * nothing: scoring starts only from startScoring (the person's click). `profilePatch` is merged
 * into a fresh copy of the profile (PUT /api/profile replaces the whole object);
 * profile.resumeVersion is NOT changed. Returns { state: "ready", fileName }.
 * Throws ReplaceError: 404 nothing waiting to be confirmed, 400 bad patch, 409 a run is scoring it.
 */
export function confirmReplacement({ profilePatch } = {}) {
  const record = getReplacement();
  if (!record || !["ready", "needs_confirmation"].includes(record.state)) {
    if (record?.state === "running") throw new ReplaceError(409, "run_in_progress", "Your new resume is being scored.");
    throw new ReplaceError(404, "nothing_pending", "There is no new resume waiting to be confirmed.");
  }

  let patch = null;
  if (profilePatch !== undefined && profilePatch !== null) {
    const checked = validateProfilePatch(profilePatch);
    if (!checked.ok) throw new ReplaceError(400, "bad_profile_patch", checked.error);
    patch = checked.patch;
  }
  if (!record.devForced && !getResumesStore().versions[record.version]?.text) {
    throw new ReplaceError(404, "nothing_pending", "The new resume is gone. Upload it again.");
  }
  if (patch && Object.keys(patch).length > 0) {
    // Re-read inside the mutator: the profile may have changed since the page loaded.
    updateState((state) => ({ ...state, profile: mergeProfile(state.profile, patch) }));
  }
  if (record.state !== "ready") setReplacement({ ...record, state: "ready" });
  return { state: "ready", fileName: record.fileName };
}

// ─── Step 3: score (the click), switch ───────────────────────────────────────────────────────

/**
 * "Score now" / "Try again": scores the ready (or failed) new resume over every job that passes
 * the prefilter, with the same lock, the same 150-call ceiling and the same scoring code as every
 * run. Returns { state: "running", startedAt } at once; the run goes on if the page closes.
 * A retry after a failure reuses the scores already in scores.json → pending.
 * Throws ReplaceError 409: a run is already going (this flow, a scrape or a scoring run), or no
 * new resume is ready to score.
 */
export function startScoring() {
  const record = getReplacement();
  if (record?.state === "running") throw new ReplaceError(409, "run_in_progress", "Your new resume is already being scored.");
  if (!record || !["ready", "failed"].includes(record.state)) {
    throw new ReplaceError(409, "nothing_ready", "There is no new resume ready to score.");
  }
  if (!record.devForced && !getResumesStore().versions[record.version]?.text) {
    throw new ReplaceError(409, "nothing_ready", "The new resume is gone. Upload it again.");
  }

  const lock = acquireRunLock("replace-resume");
  if (!lock.ok) {
    throw new ReplaceError(
      409,
      "run_in_progress",
      `A ${lock.holder?.kind ?? "scrape or scoring"} run is already in progress. Try again when it finishes.`
    );
  }

  const startedAt = new Date().toISOString();
  try {
    setReplacement({ ...record, state: "running", startedAt, finishedAt: null, calls: 0, message: null });
  } catch (err) {
    lock.release();
    throw err;
  }

  runInProgress = true;
  liveCalls = 0;
  const run = record.devForced ? simulateDevRun(record) : runReplacement(record.version, startedAt);
  return {
    state: "running",
    startedAt,
    // The run itself, for the tests to await. The route doesn't wait for it.
    finished: run.finally(() => {
      runInProgress = false;
      lock.release();
    }),
  };
}

// The years the model is told: what runs after the switch will use (profile.resumeVersion will be
// this resume, so the profile's years win when they're a whole number, else the extraction's), so
// the cache keys written now are the ones those runs look for.
function yearsAfterSwitch(profile, version) {
  if (Number.isInteger(profile?.yearsOfExperience)) return profile.yearsOfExperience;
  const extracted = version.extraction?.fields?.yearsOfExperience;
  return Number.isInteger(extracted) ? extracted : null;
}

// One line per run in data/ai-usage.jsonl (the existing usage log), so real durations can be
// measured: when it started and finished, how many scoring calls it made, and how it ended.
function logRun({ startedAt, finishedAt, calls, outcome, costUsd = null, message = null, resumeVersion = null, devForced = false }) {
  appendAiUsage({
    at: finishedAt,
    task: "replace-resume-scoring-run",
    resumeVersion: resumeVersion ? resumeVersion.slice(0, 12) : null,
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
    calls,
    outcome,
    estimatedCostUsd: costUsd,
    ...(message ? { message } : {}),
    ...(devForced ? { devForced: true } : {}),
  });
}

async function runReplacement(resumeVersion, startedAt) {
  let costUsd = null;
  const fail = (message) => {
    const finishedAt = new Date().toISOString();
    const record = getResumesStore().replacement;
    if (record) setReplacement({ ...record, state: "failed", message, finishedAt, calls: liveCalls });
    logRun({ startedAt, finishedAt, calls: liveCalls, outcome: "failed", costUsd, message, resumeVersion });
    console.warn(`[replace-resume] failed after ${liveCalls} call(s): ${message}`);
  };

  try {
    const version = getResumesStore().versions[resumeVersion];
    const yearsOfExperience = yearsAfterSwitch(getState().profile, version);
    const report = await scoreJobs({
      maxCalls: DEFAULT_MAX_CALLS,
      replacement: { resumeVersion, resumeText: version.text, yearsOfExperience },
      onCall: () => {
        liveCalls += 1;
      },
    });
    costUsd = report.costUsd ?? null;

    if (report.status !== "ok") return fail(report.reason ?? "Scoring couldn't start.");
    if (report.aborted) return fail(`Scoring stopped: ${report.aborted}`);
    if (report.leftByCeiling > 0) {
      return fail(`Scoring reached the ${DEFAULT_MAX_CALLS}-call limit with ${report.leftByCeiling} job(s) left. Retry to score the rest (what's done is kept).`);
    }
    console.log(`[replace-resume] scored ${report.scored.length} job(s), ${report.failed.length} rejected, ${liveCalls} call(s), $${report.costUsd}`);
    const finishedAt = new Date().toISOString();
    activateReplacement(resumeVersion, { startedAt, finishedAt, calls: liveCalls });
    logRun({ startedAt, finishedAt, calls: liveCalls, outcome: "done", costUsd, resumeVersion });
  } catch (err) {
    fail(err.message);
  }
}

// DEV ONLY (records made by `npm run dev:scoring-state`, marked devForced): a pretend run for
// clicking through the UI. No call, no scores, no switch: after a few seconds the record ends as
// the script asked (devOutcome "done" or "failed"). A real record never has devForced.
export const DEV_RUN_MS = 15_000;
function simulateDevRun(record) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const finishedAt = new Date().toISOString();
      const current = getResumesStore().replacement;
      if (current?.devForced && current.state === "running") {
        const outcome = record.devOutcome === "failed" ? "failed" : "done";
        setReplacement({
          ...current,
          state: outcome,
          finishedAt,
          calls: 0,
          ...(outcome === "failed" ? { message: "Dev run set to fail." } : { doneSeen: false }),
        });
        logRun({ startedAt: current.startedAt, finishedAt, calls: 0, outcome, devForced: true });
      }
      resolve();
    }, DEV_RUN_MS);
  });
}

/**
 * The switch. Synchronous (no await between the writes), so no request can see a half-switched
 * state: the pending scores replace the old ones, the new resume becomes active, the profile
 * points to it, the old original file is deleted and the pending record is cleared. Scores for the
 * old version that no new score replaced stay in scores.json, never shown.
 */
export function activateReplacement(resumeVersion, run = {}) { // exported for the tests
  const before = getResumesStore();
  const oldVersion = before.currentVersion;
  const fileName = before.versions[resumeVersion]?.fileName ?? before.replacement?.fileName ?? null;

  updateScoresStore((s) => {
    if (s.pending?.resumeVersion !== resumeVersion) return { ...s, pending: null };
    return {
      ...s,
      scores: { ...s.scores, ...s.pending.scores },
      failures: { ...(s.failures ?? {}), ...(s.pending.failures ?? {}) },
      pending: null,
    };
  });
  // resumeValues is what the Role page compares answers with ("Found in resume"): the new resume's
  // values, built the way the onboarding upload builds them (designation + adjacent roles, max 5).
  const fields = before.versions[resumeVersion]?.extraction?.fields;
  const resumeValues = {
    roles: fields?.designation ? [fields.designation, ...(fields.adjacentRoles ?? [])].slice(0, 5) : [],
    yearsOfExperience: fields?.yearsOfExperience ?? null,
  };
  // The run scored every eligible job against the details as they were when it started, so a Details
  // edit made before that is covered and its "needs refresh" mark ends; a later edit stays waiting.
  updateState((state) => {
    const rec = state.scoringRefresh;
    const covered = rec?.pending && (!rec.editedAt || !run.startedAt || rec.editedAt <= run.startedAt);
    return {
      ...state,
      profile: { ...(state.profile ?? {}), resumeVersion, resumeValues },
      ...(covered ? { scoringRefresh: { ...rec, pending: false, state: "idle" } } : {}),
    };
  });
  const oldStoredAs = oldVersion && oldVersion !== resumeVersion ? before.versions[oldVersion]?.storedAs : null;
  updateResumesStore((s) => {
    const versions = { ...s.versions };
    if (oldStoredAs && versions[oldVersion]) versions[oldVersion] = { ...versions[oldVersion], storedAs: null };
    return {
      ...s,
      currentVersion: resumeVersion,
      versions,
      replacement: {
        state: "done",
        fileName,
        startedAt: run.startedAt ?? null,
        finishedAt: run.finishedAt ?? new Date().toISOString(),
        calls: run.calls ?? null,
        doneSeen: false,
      },
    };
  });
  deleteResumeFile(oldStoredAs);
  console.log(`[replace-resume] switched to ${resumeVersion.slice(0, 12)}`);
}

// ─── The file the Resume tab shows (the latest upload) ────────────────────────────────────────

/**
 * The resume the Change Preferences > Resume row names and its download serves: the LATEST
 * uploaded file. While a new resume is ready, being scored or failed, that is the new resume, read
 * from its own version entry and its own stored file (resume-<its sha256>.<ext>, never the old
 * one's); otherwise (none, waiting for Confirm details, done) the active resume. Read only: it never
 * changes which resume is active or when it switches (scoring, tailoring and cover letters keep
 * reading currentVersion). A dev-forced record has no file, so the active one is shown.
 * Returns { fileName, storedAs, latestIsNew } | null.
 */
export function latestResumeFile() {
  const record = getReplacement();
  const resumes = getResumesStore();
  const waiting =
    ["ready", "running", "failed"].includes(record?.state) && record.version && record.version !== resumes.currentVersion
      ? resumes.versions[record.version]
      : null;
  const version = waiting ?? (resumes.currentVersion ? resumes.versions[resumes.currentVersion] : null);
  if (!version) return null;
  return { fileName: version.fileName ?? null, storedAs: version.storedAs ?? null, latestIsNew: Boolean(waiting) };
}

// ─── GET /api/resume/scoring and its two flags ───────────────────────────────────────────────

const SCORING_STATE = { ready: "ready", running: "running", failed: "failed", done: "done" };

/**
 * What the Job Recommendations page and the Resume tab show:
 * { state: "none" | "ready" | "running" | "failed" | "done", fileName, startedAt, finishedAt,
 *   calls, modalSeen, doneSeen }. "none" covers no new resume and one still waiting for Confirm
 * details. startedAt / finishedAt / calls describe the last run (null before any run); while it
 * runs, calls is the number made so far. Real states only, no progress estimate.
 */
export function getScoringStatus() {
  const r = getReplacement();
  const state = SCORING_STATE[r?.state] ?? "none";
  if (state === "none") return { state, fileName: null, startedAt: null, finishedAt: null, calls: null, modalSeen: false, doneSeen: false };
  return {
    state,
    fileName: r.fileName ?? null,
    startedAt: r.startedAt ?? null,
    finishedAt: state === "running" ? null : r.finishedAt ?? null,
    calls: state === "running" && runInProgress ? liveCalls : r.calls ?? null,
    modalSeen: Boolean(r.modalSeen),
    doneSeen: Boolean(r.doneSeen),
  };
}

/**
 * PUT /api/resume/scoring/modal-seen and /done-seen. modalSeen needs a confirmed new resume
 * (ready, running or failed); doneSeen needs a finished run. Otherwise 409. Idempotent.
 */
export function markScoringSeen(flag) {
  const r = getReplacement();
  const allowed = flag === "modalSeen" ? ["ready", "running", "failed"] : ["done"];
  if (!r || !allowed.includes(r.state)) {
    throw new ReplaceError(409, "wrong_state", flag === "modalSeen" ? "There is no new resume to score." : "No scoring run has finished.");
  }
  if (!r[flag]) setReplacement({ ...r, [flag]: true });
  return getScoringStatus();
}

// ─── Discard ─────────────────────────────────────────────────────────────────────────────────

/** Drops a pending (or failed, or finished) replacement and the new resume's stored file. Not while running. */
export function discardReplacement() {
  const record = getReplacement();
  if (!record) return { state: "idle" };
  if (record.state === "running") throw new ReplaceError(409, "run_in_progress", "A replacement is being scored; it can't be discarded now.");

  if (record.state !== "done" && record.version) {
    const store = getResumesStore();
    if (record.version !== store.currentVersion) {
      deleteResumeFile(store.versions[record.version]?.storedAs);
      updateResumesStore((s) => {
        const versions = { ...s.versions };
        delete versions[record.version];
        return { ...s, versions, replacement: null };
      });
      updateScoresStore((s) => (s.pending?.resumeVersion === record.version ? { ...s, pending: null } : s));
      return { state: "idle" };
    }
  }
  updateResumesStore((s) => ({ ...s, replacement: null }));
  return { state: "idle" };
}

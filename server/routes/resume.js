import { createHash } from "node:crypto";
import express, { Router } from "express";
import { getResumesStore, updateResumesStore, saveResumeFile, readResumeFile } from "../store/store.js";
import { extractResumeContent } from "../resume/extractText.js";
import { extractResumeFields, EXTRACTION_VERSION } from "../ai/extractResume.js";
import { resolveLocation } from "../geo/cities.js";
import {
  ReplaceError,
  ACCEPTED_EXTENSIONS,
  prepareReplacement,
  confirmReplacement,
  getReplacementStatus,
  discardReplacement,
  startScoring,
  getScoringStatus,
  markScoringSeen,
  latestResumeFile,
} from "../ai/replaceResume.js";

const router = Router();

const MAX_SIZE = 25 * 1024 * 1024;

/**
 * POST /api/resume
 * Body: the raw file bytes (Content-Type: application/octet-stream).
 * Header: X-File-Name (URI-encoded original file name; the extension picks the parser).
 *
 * Returns { resumeVersion, fileName, cached, extraction: { status, fields, error? } }.
 * status is "ok" or "failed". The resume text itself never leaves the server.
 * fields.locationResolved is fields.location mapped to { label, city, region, country,
 * countryCode } via the offline city list (plain code, not cached, so the city list can
 * improve without re-running extraction). null when no location was extracted.
 *
 * Caching: resumeVersion is the SHA-256 of the file bytes. The cache key is that hash plus
 * EXTRACTION_VERSION (server/ai/extractResume.js): re-uploading a file whose stored extraction
 * has the current extraction version returns it with no API call. A different file, or a
 * stored extraction from an older extraction version, makes one call, and that file becomes
 * the current resume version. A version whose earlier extraction failed is tried once more
 * on re-upload (that's the user retrying, not a loop).
 *
 * The original file is kept in data/resume-files/ (see GET /api/resume/file); a re-upload of the
 * same file stores it with no call if it wasn't kept before. The extracted text is stored only in
 * resumes.json, as before.
 */
router.post(
  "/resume",
  express.raw({ type: "application/octet-stream", limit: MAX_SIZE }),
  async (req, res) => {
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: "Expected the resume file as the request body." });
    }
    let fileName;
    try {
      fileName = decodeURIComponent(req.get("X-File-Name") ?? "");
    } catch {
      fileName = "";
    }
    if (!fileName) {
      return res.status(400).json({ error: "Missing X-File-Name header." });
    }

    const resumeVersion = createHash("sha256").update(buffer).digest("hex");
    const existing = getResumesStore().versions[resumeVersion];
    const extension = ACCEPTED_EXTENSIONS.find((ext) => fileName.toLowerCase().endsWith(ext));
    // Kept so the resume can be downloaded again; an unsupported type was never going to be read.
    const storedAs = extension ? saveResumeFile(buffer, resumeVersion, extension) : null;

    if (existing?.extraction?.extractionVersion === EXTRACTION_VERSION) {
      updateResumesStore((store) => ({
        ...store,
        currentVersion: resumeVersion,
        versions: { ...store.versions, [resumeVersion]: { ...store.versions[resumeVersion], ...(storedAs ? { storedAs } : {}) } },
      }));
      console.log(`[resume] ${fileName}: cache hit for version ${resumeVersion.slice(0, 12)}, no API call`);
      return res.json({
        resumeVersion,
        fileName,
        cached: true,
        extraction: { status: "ok", fields: withResolvedLocation(existing.extraction.fields) },
      });
    }

    let text = null;
    let links = [];
    let fields = null;
    let error = null;

    try {
      // Re-read locally every time a call is needed: it's cheap, and older stored versions
      // predate link extraction.
      ({ text, links } = await extractResumeContent(buffer, fileName));
      if (!text) throw new Error("No text found in the file (it may be a scanned image).");
      const { model, extractionVersion, ...extracted } = await extractResumeFields(text, {
        links,
        resumeVersion,
      });
      fields = extracted;
      updateResumesStore((store) => saveVersion(store, resumeVersion, {
        fileName,
        storedAs,
        text,
        links,
        extraction: { fields, model, extractionVersion, extractedAt: new Date().toISOString() },
      }));
    } catch (err) {
      error = err.message;
      console.warn(`[resume] extraction failed for ${fileName}: ${err.message}`);
      // Still record the version (and its text, if we got that far) so it becomes current
      // and scoring/tailoring can use it; the user fills the Role page in by hand.
      updateResumesStore((store) => saveVersion(store, resumeVersion, { fileName, storedAs, text, links, extraction: null }));
    }

    res.json({
      resumeVersion,
      fileName,
      cached: false,
      extraction: fields
        ? { status: "ok", fields: withResolvedLocation(fields) }
        : { status: "failed", fields: null, error },
    });
  }
);

/**
 * GET /api/resume/file
 * The ACTIVE resume's original file as an attachment with its original name. 404 when there is
 * none (a resume uploaded before files were kept). Never a call.
 */
router.get("/resume/file", (req, res) => {
  const { currentVersion, versions } = getResumesStore();
  const version = currentVersion ? versions[currentVersion] : null;
  sendResumeFile(res, version?.fileName, version?.storedAs);
});

/**
 * GET /api/resume/latest-file
 * The LATEST uploaded resume's original file (the Resume tab's download): the new resume's own
 * stored file while it is ready, being scored or failed; otherwise the active resume's. Read only;
 * it never changes which resume is active. 404 when there is none. Never a call.
 */
router.get("/resume/latest-file", (req, res) => {
  const latest = latestResumeFile();
  sendResumeFile(res, latest?.fileName, latest?.storedAs);
});

function sendResumeFile(res, fileName, storedAs) {
  const buffer = storedAs ? readResumeFile(storedAs) : null;
  if (!buffer) return res.status(404).json({ error: "no_file", message: "No original file is stored for this resume." });
  const name = fileName || storedAs;
  const type = name.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.send(buffer);
}

// ─── Replace resume (Change Preferences > Resume) ─────────────────────────────────────────────
// See server/ai/replaceResume.js for the whole flow. Errors are { error: code, message }.

function replyError(res, err) {
  if (err instanceof ReplaceError) return res.status(err.status).json({ error: err.code, message: err.message });
  throw err;
}

/**
 * POST /api/resume/replace
 * Same body and file rules as POST /api/resume (raw bytes, X-File-Name, PDF or DOCX, 25MB). Reads
 * the file and runs the extraction (one Haiku call at most; none for a file already extracted or
 * the active resume), stores the new resume as PENDING (the old one stays active) and runs the
 * plain-code mismatch check. Responds
 *   { status: "same_file", fileName }                         nothing to replace
 *   { status: "ready", fileName, cached, current, fromResume }
 *   { status: "needs_confirmation", fileName, cached, reasons[{code,message}], current, fromResume }
 * 409 while the new resume is being scored (checked first, so even the same file is refused; the
 * Resume tab disables Replace file then), 400 bad file, 422 unreadable file or failed extraction
 * (nothing pending, the old resume stays).
 */
router.post(
  "/resume/replace",
  express.raw({ type: "application/octet-stream", limit: MAX_SIZE }),
  async (req, res) => {
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: "bad_request", message: "Expected the resume file as the request body." });
    }
    let fileName;
    try {
      fileName = decodeURIComponent(req.get("X-File-Name") ?? "");
    } catch {
      fileName = "";
    }
    if (!fileName) return res.status(400).json({ error: "bad_request", message: "Missing X-File-Name header." });
    try {
      res.json(await prepareReplacement({ buffer, fileName }));
    } catch (err) {
      replyError(res, err);
    }
  }
);

/**
 * POST /api/resume/replace/confirm
 * Optional JSON body { profilePatch }: any of roles, yearsOfExperience, locations, workTypes,
 * relocation, workAuth, websites, with the Details dialogs' validation. Merged into a fresh copy of
 * the profile (profile.resumeVersion unchanged). Starts NOTHING: the new resume waits in "ready"
 * until the person clicks "Score now" (POST /api/resume/scoring/start). Responds
 * { state: "ready", fileName }. 400 bad patch, 404 nothing waiting, 409 it is being scored.
 */
router.post("/resume/replace/confirm", (req, res) => {
  try {
    res.json(confirmReplacement({ profilePatch: req.body?.profilePatch }));
  } catch (err) {
    replyError(res, err);
  }
});

// ─── Score new resume (Job Recommendations and the Resume tab) ────────────────────────────────

/**
 * POST /api/resume/scoring/start
 * The person's click on "Score now" or "Try again": scores the ready (or failed) new resume over
 * every job that passes the prefilter (Sonnet, the same run lock, 150-call ceiling and scoring code
 * as every run; the approved exception to "scoring never runs from a route"). Returns
 * { state: "running", startedAt } at once; the run goes on if the page closes, and the new resume
 * becomes active only when all of it is scored. A retry reuses scores already made.
 * 409 a run is already going (this flow, a scrape or a scoring run) or nothing is ready to score.
 */
router.post("/resume/scoring/start", (req, res) => {
  try {
    const { finished, ...body } = startScoring(); // the route never waits for the run
    finished.catch(() => {});
    res.json(body);
  } catch (err) {
    replyError(res, err);
  }
});

/**
 * GET /api/resume/scoring
 * { state: "none" | "ready" | "running" | "failed" | "done", fileName, startedAt, finishedAt, calls,
 *   modalSeen, doneSeen }. Never a call; safe to poll.
 */
router.get("/resume/scoring", (req, res) => {
  res.json(getScoringStatus());
});

/** PUT /api/resume/scoring/modal-seen: the "Rescore your jobs?" dialog was shown and closed or acted on. */
router.put("/resume/scoring/modal-seen", (req, res) => {
  try {
    res.json(markScoringSeen("modalSeen"));
  } catch (err) {
    replyError(res, err);
  }
});

/** PUT /api/resume/scoring/done-seen: the success banner was shown once. */
router.put("/resume/scoring/done-seen", (req, res) => {
  try {
    res.json(markScoringSeen("doneSeen"));
  } catch (err) {
    replyError(res, err);
  }
});

/**
 * GET /api/resume/replace
 * { state: "idle" | "ready" | "needs_confirmation" | "running" | "failed" | "done", fileName,
 *   reasons?, current?, fromResume?, message? } so a reloaded page picks up where it was.
 * ("ready" is a new resume waiting for "Score now": no mismatch, or Confirm details was saved.)
 */
router.get("/resume/replace", (req, res) => {
  res.json(getReplacementStatus());
});

/** DELETE /api/resume/replace: discard a pending, failed or finished replacement (409 while running). */
router.delete("/resume/replace", (req, res) => {
  try {
    res.json(discardReplacement());
  } catch (err) {
    replyError(res, err);
  }
});

function withResolvedLocation(fields) {
  return { ...fields, locationResolved: resolveLocation(fields.location) };
}

function saveVersion(store, version, data) {
  const prev = store.versions[version];
  return {
    ...store,
    currentVersion: version,
    versions: {
      ...store.versions,
      [version]: {
        version,
        uploadedAt: prev?.uploadedAt ?? new Date().toISOString(),
        ...data,
      },
    },
  };
}

export default router;

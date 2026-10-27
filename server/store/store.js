import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// APPLYMATE_DATA_DIR points the store somewhere else (the tests use a temp folder so they never
// touch the real data/).
const DATA_DIR = process.env.APPLYMATE_DATA_DIR
  ? path.resolve(process.env.APPLYMATE_DATA_DIR)
  : path.join(__dirname, "..", "..", "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const JOBS_PATH = path.join(DATA_DIR, "jobs.json");

const SCHEMA_VERSION = 1;

// Job data lives in its own file: it's already ~5MB and only grows, while every bookmark,
// dismiss or last-viewed write touches store.json. Splitting them means those small, frequent
// writes never rewrite the job blob, and a scrape run never rewrites watchlist/profile/userState.
function defaultStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    watchlist: [],
    companyMeta: {},
    profile: null,
    userState: {
      savedJobIds: [],
      dismissedJobIds: [],
      // jobId → ISO time it was saved (see writeMembership in routes/state.js)
      savedAt: {},
      lastViewed: { watchlist: null },
      // When the one-time "Customizing resume…" tip on Job Recommendations was dismissed, or null.
      customizeTipSeenAt: null,
      // When the one-time Job Details tips (Download Files, Mark as applied) were dismissed with "Got it", or null.
      downloadFilesTipSeenAt: null,
      markAppliedTipSeenAt: null,
    },
    meta: { lastScrapeAt: null },
  };
}

function defaultJobsStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    jobs: [],
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Atomic write: write to a temp file in the same directory, then rename —
// rename is atomic on the same filesystem, so a crash mid-write can never
// leave the target file truncated or half-written.
function writeJsonSync(filePath, data) {
  ensureDataDir();
  const tmpPath = path.join(DATA_DIR, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function readJsonSync(filePath, defaultFactory) {
  ensureDataDir();

  if (!fs.existsSync(filePath)) {
    const fresh = defaultFactory();
    writeJsonSync(filePath, fresh);
    return fresh;
  }

  const raw = fs.readFileSync(filePath, "utf-8");

  try {
    const parsed = JSON.parse(raw);
    return { ...defaultFactory(), ...parsed };
  } catch (err) {
    const base = path.basename(filePath, ".json");
    const corruptPath = path.join(DATA_DIR, `${base}.corrupt.${Date.now()}.json`);
    try {
      fs.renameSync(filePath, corruptPath);
    } catch {
      // If even the rename fails, fall through and reset in place anyway —
      // losing the corrupt backup is better than the server refusing to start.
    }
    console.warn(
      `[store] data/${path.basename(filePath)} was corrupted (${err.message}). ` +
        `Moved it to ${path.basename(corruptPath)} and started fresh.`
    );
    const fresh = defaultFactory();
    writeJsonSync(filePath, fresh);
    return fresh;
  }
}

export function getState() {
  return readJsonSync(STORE_PATH, defaultStore);
}

// Reads the current state, applies `mutator`, writes the result, and
// returns it — every write goes through this one path so reads are never
// stale between a GET and the next PUT/PATCH.
export function updateState(mutator) {
  const current = readJsonSync(STORE_PATH, defaultStore);
  const next = mutator(current);
  writeJsonSync(STORE_PATH, next);
  return next;
}

// jobs.json is tens of MB, so the server keeps the parsed copy in memory and only re-reads it when
// the file on disk changes (modified time or size) — scrapes run from a separate script and write
// it there. Callers must treat the returned object as read-only; it's shared between requests.
let jobsCache = null; // { mtimeMs, size, data }

function jobsFileStamp() {
  try {
    const { mtimeMs, size } = fs.statSync(JOBS_PATH);
    return { mtimeMs, size };
  } catch {
    return null;
  }
}

export function getJobsStore() {
  const stamp = jobsFileStamp();
  if (stamp && jobsCache && jobsCache.mtimeMs === stamp.mtimeMs && jobsCache.size === stamp.size) {
    return jobsCache.data;
  }
  const data = readJsonSync(JOBS_PATH, defaultJobsStore);
  // Stamp taken after the read: a fresh or reset file is written during it.
  const after = jobsFileStamp();
  jobsCache = after ? { ...after, data } : null;
  return data;
}

export function updateJobsStore(mutator) {
  const current = readJsonSync(JOBS_PATH, defaultJobsStore);
  const next = mutator(current);
  writeJsonSync(JOBS_PATH, next);
  const stamp = jobsFileStamp();
  jobsCache = stamp ? { ...stamp, data: next } : null;
  return next;
}

// Resumes live in their own file so the full resume text never rides along in GET /api/state
// (which ships store.json to the browser). Keyed by a SHA-256 of the uploaded file's bytes —
// that hash is the "resume version" scores and tailoring will cache against later.
const RESUMES_PATH = path.join(DATA_DIR, "resumes.json");

function defaultResumesStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    currentVersion: null,
    versions: {},
    // Change Preferences > Resume: the replacement in progress (or its last outcome), or null. The
    // new resume's version lives in `versions` like any other but is NOT currentVersion until the
    // switch. See server/ai/replaceResume.js.
    replacement: null,
  };
}

export function getResumesStore() {
  return readJsonSync(RESUMES_PATH, defaultResumesStore);
}

export function updateResumesStore(mutator) {
  const current = readJsonSync(RESUMES_PATH, defaultResumesStore);
  const next = mutator(current);
  writeJsonSync(RESUMES_PATH, next);
  return next;
}

// Match scores live in their own file rather than on each job: jobs.json is large and rewritten
// per company on every scrape, while scores are written one job at a time during a scoring run.
// Keyed by job id, one entry per job. Each entry records the resume version it was made for;
// the API only serves entries for the current resume version.
const SCORES_PATH = path.join(DATA_DIR, "scores.json");

function defaultScoresStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    scores: {},
    // Scores for a resume that is being swapped in (Change Preferences > Resume), kept apart from
    // `scores` so the active resume's scores keep showing until the switch:
    // { resumeVersion, scores: { jobId → entry }, failures: { jobId → record } } or null.
    pending: null,
    // jobId → { key: "resumeVersion|scoringVersion", attempts, lastError, lastAt } for answers
    // the scoring checks rejected (see MAX_REJECTED_ATTEMPTS in server/ai/runScoring.js).
    failures: {},
  };
}

export function getScoresStore() {
  return readJsonSync(SCORES_PATH, defaultScoresStore);
}

export function updateScoresStore(mutator) {
  const current = readJsonSync(SCORES_PATH, defaultScoresStore);
  const next = mutator(current);
  writeJsonSync(SCORES_PATH, next);
  return next;
}

// The daily scheduler's own record (server/scheduler/scheduler.js): which 9 AM slot it is working
// on, attempts so far, and the last run's outcome. Local, gitignored (data/), never served.
const SCHEDULER_PATH = path.join(DATA_DIR, "scheduler.json");

function defaultSchedulerStore() {
  return { schemaVersion: SCHEMA_VERSION, slot: null, lastRun: null, othersWork: null };
}

export function getSchedulerStore() {
  return readJsonSync(SCHEDULER_PATH, defaultSchedulerStore);
}

export function updateSchedulerStore(mutator) {
  const next = mutator(readJsonSync(SCHEDULER_PATH, defaultSchedulerStore));
  writeJsonSync(SCHEDULER_PATH, next);
  return next;
}

// Append-only usage log, one JSON object per line. Never rewritten, so a plain append is safe.
const AI_USAGE_PATH = path.join(DATA_DIR, "ai-usage.jsonl");

export function appendAiUsage(entry) {
  ensureDataDir();
  fs.appendFileSync(AI_USAGE_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

// The original resume file, kept so it can be downloaded again (GET /api/resume/file). One file per
// resume version, named by its hash, in data/resume-files/ (gitignored, never served except through
// that route). Its extracted text lives in resumes.json only, never anywhere new.
const RESUME_FILES_DIR = path.join(DATA_DIR, "resume-files");

// storedAs is always a bare file name the server made itself; basename() keeps a tampered store
// from pointing outside the folder.
export function resumeFilePath(storedAs) {
  return path.join(RESUME_FILES_DIR, path.basename(storedAs));
}

/** Writes the resume file atomically. Returns the stored name. */
export function saveResumeFile(buffer, fileHash, extension) {
  if (!fs.existsSync(RESUME_FILES_DIR)) fs.mkdirSync(RESUME_FILES_DIR, { recursive: true });
  const storedAs = `resume-${fileHash}${extension}`;
  const tmpPath = path.join(RESUME_FILES_DIR, `.${storedAs}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, resumeFilePath(storedAs));
  return storedAs;
}

/** Removes a stored resume file; a file that's already gone is fine. */
export function deleteResumeFile(storedAs) {
  if (!storedAs) return;
  try {
    fs.unlinkSync(resumeFilePath(storedAs));
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`[store] couldn't delete ${storedAs}: ${err.message}`);
  }
}

export function readResumeFile(storedAs) {
  try {
    return fs.readFileSync(resumeFilePath(storedAs));
  } catch {
    return null;
  }
}

// Tailored resume drafts, one per job + resume version + TAILORING_VERSION (server/ai/
// tailorResume.js), written only when a tailoring call finishes. Drafts for an older resume are
// kept, so replacing the resume never changes a draft already made. User edits are never saved.
const TAILORED_PATH = path.join(DATA_DIR, "tailored.json");

function defaultTailoredStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    // "jobId|resumeVersion|tailoringVersion" → draft
    drafts: {},
  };
}

export function getTailoredStore() {
  return readJsonSync(TAILORED_PATH, defaultTailoredStore);
}

export function updateTailoredStore(mutator) {
  const current = readJsonSync(TAILORED_PATH, defaultTailoredStore);
  const next = mutator(current);
  writeJsonSync(TAILORED_PATH, next);
  return next;
}

// Writing style for cover letters (Change Preferences > Cover Letter). Holds the tone text as
// written and, for an attached old cover letter, a short style summary plus the file's name, hash
// and stored file name (the original file sits in data/writing-style-files/; its extracted text is
// never stored). Kept out of store.json so GET /api/state never carries it.
const WRITING_STYLE_PATH = path.join(DATA_DIR, "writing-style.json");

function defaultWritingStyleStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    tone: "",
    // { fileName, fileHash, storedAs, size, styleVersion, summary, model, summarizedAt } or null.
    // storedAs is missing for a letter saved before original files were kept.
    letter: null,
    updatedAt: null,
  };
}

export function getWritingStyleStore() {
  return readJsonSync(WRITING_STYLE_PATH, defaultWritingStyleStore);
}

export function updateWritingStyleStore(mutator) {
  const current = readJsonSync(WRITING_STYLE_PATH, defaultWritingStyleStore);
  const next = mutator(current);
  writeJsonSync(WRITING_STYLE_PATH, next);
  return next;
}

// The original old cover letter file, kept so a future STYLE_VERSION can re-summarize it (only
// on an explicit save) and so it can be downloaded again. One file at a time, named by its hash,
// in data/ (gitignored, never served except through GET /api/writing-style/letter).
const WRITING_STYLE_FILES_DIR = path.join(DATA_DIR, "writing-style-files");

function ensureWritingStyleFilesDir() {
  if (!fs.existsSync(WRITING_STYLE_FILES_DIR)) fs.mkdirSync(WRITING_STYLE_FILES_DIR, { recursive: true });
}

// storedAs is always a bare file name the server made itself; basename() keeps a tampered store
// from pointing outside the folder.
export function writingStyleFilePath(storedAs) {
  return path.join(WRITING_STYLE_FILES_DIR, path.basename(storedAs));
}

/** Writes the letter file atomically. Returns the stored name. */
export function saveWritingStyleFile(buffer, fileHash, extension) {
  ensureWritingStyleFilesDir();
  const storedAs = `letter-${fileHash}${extension}`;
  const target = writingStyleFilePath(storedAs);
  const tmpPath = path.join(WRITING_STYLE_FILES_DIR, `.${storedAs}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, target);
  return storedAs;
}

/** Removes a stored letter file; a file that's already gone is fine. */
export function deleteWritingStyleFile(storedAs) {
  if (!storedAs) return;
  try {
    fs.unlinkSync(writingStyleFilePath(storedAs));
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`[store] couldn't delete ${storedAs}: ${err.message}`);
  }
}

export function readWritingStyleFile(storedAs) {
  try {
    return fs.readFileSync(writingStyleFilePath(storedAs));
  } catch {
    return null;
  }
}

// Job applications (Application Tracker), one record per job id, created by "Apply now" (pending)
// and moved along by the person. Each record carries a snapshot of the job so it outlives the job
// in jobs.json. See server/routes/applications.js.
const APPLICATIONS_PATH = path.join(DATA_DIR, "applications.json");

function defaultApplicationsStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    // jobId → { jobId, status, archived, statusHistory, createdAt, appliedAt, scoreAtApply, job }
    applications: {},
  };
}

export function getApplicationsStore() {
  return readJsonSync(APPLICATIONS_PATH, defaultApplicationsStore);
}

export function updateApplicationsStore(mutator) {
  const current = readJsonSync(APPLICATIONS_PATH, defaultApplicationsStore);
  const next = mutator(current);
  writeJsonSync(APPLICATIONS_PATH, next);
  return next;
}

// Jobs that must never be hidden by the 60-day freshness rule or dropped by a scrape's replacement
// or purge: saved jobs and any job with an application record (any status, pending included).
// Always read fresh at the moment it's needed, so a save or application made during a long scrape
// is not lost. `state` may be passed when the caller already has it.
export function getExemptJobIds(state = getState()) {
  return new Set([
    ...(state.userState?.savedJobIds ?? []),
    ...Object.keys(getApplicationsStore().applications ?? {}),
  ]);
}

// Cover letters, one per job + hash of the resume text used + hash of the writing style +
// COVER_LETTER_VERSION (server/ai/writeCoverLetter.js), written only when a call finishes.
const COVER_LETTERS_PATH = path.join(DATA_DIR, "cover-letters.json");

function defaultCoverLettersStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    // "jobId|resumeHash|styleHash|coverLetterVersion" → letter
    letters: {},
    // jobId → key of the most recent letter for that job (what GET returns)
    latestByJob: {},
  };
}

export function getCoverLettersStore() {
  return readJsonSync(COVER_LETTERS_PATH, defaultCoverLettersStore);
}

export function updateCoverLettersStore(mutator) {
  const current = readJsonSync(COVER_LETTERS_PATH, defaultCoverLettersStore);
  const next = mutator(current);
  writeJsonSync(COVER_LETTERS_PATH, next);
  return next;
}

// The person's saved edits of a generated resume or cover letter (Customize Application), one per
// job + tab + the key of the draft or letter that was edited. The generated drafts and letters are
// never modified. Only sanitized HTML is stored (server/edited/sanitizeEdited.js).
const EDITED_DOCUMENTS_PATH = path.join(DATA_DIR, "edited-documents.json");

function defaultEditedDocumentsStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    // "jobId|tab|draftOrLetterKey" → { html, savedAt }
    edits: {},
  };
}

export function getEditedDocumentsStore() {
  return readJsonSync(EDITED_DOCUMENTS_PATH, defaultEditedDocumentsStore);
}

export function updateEditedDocumentsStore(mutator) {
  const current = readJsonSync(EDITED_DOCUMENTS_PATH, defaultEditedDocumentsStore);
  const next = mutator(current);
  writeJsonSync(EDITED_DOCUMENTS_PATH, next);
  return next;
}

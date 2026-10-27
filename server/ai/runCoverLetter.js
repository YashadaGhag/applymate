import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getJobsStore, getResumesStore, getWritingStyleStore, getCoverLettersStore, updateCoverLettersStore } from "../store/store.js";
import { writeCoverLetter, COVER_LETTER_VERSION, CoverLetterError } from "./writeCoverLetter.js";
import { checkCoverLetter } from "./tailorCheck.js";
import { getSavedDraft, formatBlocks } from "./runTailoring.js";
import { getSavedEditedResume } from "../edited/editedDocuments.js";
import { estimateCostUsd } from "./client.js";

const CLOSING = "Sincerely,";

/** A request that can't start a cover letter call (unknown job, closed job, no resume, bad body). */
export class CoverLetterRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "CoverLetterRequestError";
    this.status = status;
    this.code = code;
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

// Saved-letter key: job id + hash of the resume text used + hash of the writing style +
// COVER_LETTER_VERSION. The same inputs again return the saved letter with no call.
export function letterKey(jobId, resumeHash, styleHash) {
  return `${jobId}|${resumeHash}|${styleHash}|${COVER_LETTER_VERSION}`;
}

// The style the letter is written in: the typed tone and the old letter's style summary.
function currentStyle() {
  const store = getWritingStyleStore();
  const tone = store.tone?.trim() || null;
  const summary = store.letter?.summary ?? null;
  return {
    tone,
    summary,
    styleHash: tone || summary ? sha256(JSON.stringify({ tone, summary })).slice(0, 16) : "none",
    used: { tone: Boolean(tone), letterSummary: Boolean(summary), letterSummaryVersion: store.letter?.styleVersion ?? null },
  };
}

const SECTION_HEADING = /^(work experience|professional experience|experience|employment( history)?|summary|professional summary|profile|about( me)?|education|skills|projects|certifications)\b/i;
// Email, phone, a year, a link. Digits inside words ("B2B") don't count.
const CONTACT_LIKE = /@|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\b(19|20)\d{2}\b|https?:|www\.|linkedin|github|\.(com|app|io|dev|me|org|net)\b/i;

/**
 * Name, headline and contact lines from the top of a plain-text resume, copied exactly: every
 * line before the first section heading. The headline is the second line when it doesn't look
 * like contact details; everything else after the name is contact.
 */
export function headerFromText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const top = [];
  for (const line of lines) {
    const allCapsHeading = line.length >= 4 && line === line.toUpperCase() && /[A-Z]/.test(line) && !CONTACT_LIKE.test(line);
    if (top.length > 0 && (SECTION_HEADING.test(line) || allCapsHeading)) break;
    top.push(line);
    if (top.length === 6) break;
  }
  const [name = null, ...rest] = top;
  const headline = rest[0] && !CONTACT_LIKE.test(rest[0]) ? rest[0] : null;
  return { name, headline, contact: headline ? rest.slice(1) : rest };
}

/**
 * Which resume text the letter is written from, in order, resolved here by job id: the SAVED
 * edited resume for this job (its text derived on the server from the sanitized saved HTML; unsaved
 * edits in the browser never count), the saved tailored draft, the base resume.
 * Returns { source: "editor" | "tailored" | "base", resumeText, header, resumeVersion }.
 */
export function resumeSource(jobId) {
  const resumes = getResumesStore();
  const resumeVersion = resumes.currentVersion;
  const edited = getSavedEditedResume(jobId);
  if (edited) {
    return { source: "editor", resumeText: edited.text, header: headerFromText(edited.text), resumeVersion };
  }
  const { draft } = getSavedDraft(jobId);
  if (draft) {
    const h = draft.blocks.find((b) => b.kind === "header");
    return {
      source: "tailored",
      resumeText: formatBlocks(draft.blocks),
      header: h ? { name: h.name, headline: h.headline, contact: h.contact } : headerFromText(formatBlocks(draft.blocks)),
      resumeVersion,
    };
  }
  const resumeText = resumeVersion ? resumes.versions[resumeVersion]?.text?.trim() ?? null : null;
  if (!resumeText) throw new CoverLetterRequestError(409, "no_resume", "Upload a resume before writing a cover letter.");
  return { source: "base", resumeText, header: headerFromText(resumeText), resumeVersion };
}

// Calls in flight in this process, by job id: one per job. A second click on the same job joins
// the running call (every event so far, then the rest) instead of starting another.
const inFlight = new Map();

/**
 * The most recent letter for this job, or null, plus whether a call is running. Never makes a
 * call. styleChanged: the writing style differs from the one the letter used. resumeChanged:
 * the resume source (saved edited resume, else tailored draft, else base resume) now has different
 * text than the letter was written from.
 */
export function getSavedLetter(jobId) {
  const store = getCoverLettersStore();
  const letter = store.letters[store.latestByJob[jobId]] ?? null;
  if (!letter) return { letter: null, inFlight: inFlight.has(jobId) };
  let resumeChanged;
  try {
    resumeChanged = sha256(resumeSource(jobId).resumeText).slice(0, 16) !== letter.resumeHash;
  } catch {
    resumeChanged = true;
  }
  return {
    letter,
    inFlight: inFlight.has(jobId),
    styleChanged: currentStyle().styleHash !== letter.styleHash,
    resumeChanged,
  };
}

/**
 * Called only from the user's click (POST route) or the cover:job script.
 * Returns { status: "cached", letter } when a letter with the same inputs is saved (no call),
 * { status: "joined", run } when a call for this job is already running, or
 * { status: "started", run } after starting the one call. run.subscribe(listener) replays the
 * events so far and follows the rest; run.promise resolves to { ok, letter } or { ok: false, error }
 * and never rejects. No retries: a failed run saves nothing, and the next click tries again.
 */
export function startCoverLetter(jobId) {
  const running = inFlight.get(jobId);
  if (running) return { status: "joined", run: running };

  const { jobs } = getJobsStore();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw new CoverLetterRequestError(404, "not_found", "No job with that id.");
  if (job.closed) throw new CoverLetterRequestError(409, "job_closed", "This job is no longer accepting applications.");

  const source = resumeSource(jobId);
  const style = currentStyle();
  const resumeHash = sha256(source.resumeText).slice(0, 16);
  const key = letterKey(jobId, resumeHash, style.styleHash);
  const saved = getCoverLettersStore().letters[key];
  if (saved) {
    updateCoverLettersStore((s) => ({ ...s, latestByJob: { ...s.latestByJob, [jobId]: key } }));
    return { status: "cached", letter: saved };
  }

  const run = createRun({ key, job, source, style, resumeHash, knownCompanies: companyNames(jobs) });
  inFlight.set(jobId, run);
  run.promise.then(() => inFlight.delete(jobId));
  return { status: "started", run };
}

function companyNames(jobs) {
  return [...new Set(jobs.map((j) => j.company?.name?.trim()).filter(Boolean))];
}

function createRun({ key, job, source, style, resumeHash, knownCompanies }) {
  const events = [];
  const listeners = new Set();
  const emit = (event) => {
    events.push(event);
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn(`[cover] listener failed: ${err.message}`);
      }
    }
  };
  const subscribe = (listener) => {
    for (const event of events) listener(event);
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const company = job.company?.name?.trim() || null;
  const header = source.header;
  const greeting = company ? `Dear ${company} Hiring Team,` : "Dear Hiring Team,";
  const signoff = { closing: CLOSING, name: header.name };

  const startedAt = Date.now();
  const promise = (async () => {
    emit({ type: "start", jobId: job.id, cached: false, coverLetterVersion: COVER_LETTER_VERSION, resumeSource: source.source });
    // Built in code, so they're on the page before the model writes a word.
    emit({ type: "block_start", index: 0, kind: "header" });
    emit({ type: "block", index: 0, block: { kind: "header", ...header } });
    emit({ type: "block_start", index: 1, kind: "greeting" });
    emit({ type: "block", index: 1, block: { kind: "greeting", text: greeting } });
    try {
      const result = await writeCoverLetter({
        job,
        resumeText: source.resumeText,
        style,
        firstIndex: 2,
        meta: { resumeSource: source.source, resumeHash, styleHash: style.styleHash },
        emit,
      });
      const signoffIndex = 2 + result.paragraphs.length;
      emit({ type: "block_start", index: signoffIndex, kind: "signoff" });
      emit({ type: "block", index: signoffIndex, block: { kind: "signoff", ...signoff } });
      emit({ type: "blocks_done" });

      const check = checkCoverLetter({
        paragraphs: result.paragraphs,
        resumeText: source.resumeText,
        knownCompanies,
        company,
        jobTitle: job.title,
        postingText: `${job.title}\n${job.descriptionText ?? ""}`,
      });
      emit({ type: "check", verified: check.verified, newItems: check.newItems });

      const letter = {
        jobId: job.id,
        key,
        coverLetterVersion: COVER_LETTER_VERSION,
        createdAt: new Date().toISOString(),
        model: result.model,
        job: { title: job.title, company },
        resumeSource: source.source,
        resumeVersion: source.resumeVersion,
        resumeHash,
        styleHash: style.styleHash,
        styleUsed: style.used,
        header,
        greeting,
        achievements: result.achievements,
        plan: result.plan,
        paragraphs: result.paragraphs,
        signoff,
        wordCount: result.wordCount,
        check: { verified: check.verified, newItems: check.newItems },
        warnings: [...result.warnings, ...check.warnings],
        usage: { inputTokens: result.usage?.input_tokens ?? 0, outputTokens: result.usage?.output_tokens ?? 0 },
        costUsd: estimateCostUsd(result.model, result.usage),
        durationMs: Date.now() - startedAt,
      };
      updateCoverLettersStore((s) => ({
        ...s,
        letters: { ...s.letters, [key]: letter },
        latestByJob: { ...s.latestByJob, [job.id]: key },
      }));
      emit({ type: "done", letter });
      return { ok: true, letter };
    } catch (err) {
      // API failures are already in ai-usage.jsonl (with tokens used so far).
      const message = err instanceof CoverLetterError ? err.message : "The cover letter call failed. Nothing was saved; you can try again.";
      console.warn(`[cover] ${job.id} (${job.title}) failed: ${err.message}`);
      emit({ type: "error", message, detail: err instanceof CoverLetterError ? null : err.message });
      return { ok: false, error: err };
    }
  })();

  return { subscribe, promise };
}

/** Plain-text rendering of a letter, for the script's output. */
export function formatLetter(letter) {
  const { header } = letter;
  return [
    header.name,
    ...(header.headline ? [header.headline] : []),
    ...header.contact,
    "",
    letter.greeting,
    "",
    ...letter.paragraphs.flatMap((p) => [p, ""]),
    letter.signoff.closing,
    letter.signoff.name,
  ].join("\n");
}

// npm run cover:job -- <jobId>
// Same call as the route (without browser text): returns the saved letter with no call when one
// with the same inputs exists.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  dotenv.config();
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: npm run cover:job -- <jobId>");
    process.exit(1);
  }
  let outcome;
  try {
    outcome = startCoverLetter(jobId);
  } catch (err) {
    console.error(`[cover] ${err.message}`);
    process.exit(1);
  }
  let letter;
  if (outcome.status === "cached") {
    console.log("[cover] Saved letter found; no API call made.\n");
    letter = outcome.letter;
  } else {
    const startedAt = Date.now();
    const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
    outcome.run.subscribe((e) => {
      if (e.type === "start") console.log(`[${elapsed()}] resume source: ${e.resumeSource}`);
      if (e.type === "thinking") console.log(`[${elapsed()}] model started`);
      if (e.type === "plan") {
        console.log(`[${elapsed()}] achievements:\n${e.achievements.map((a) => `    - ${a}`).join("\n")}`);
        console.log(`[${elapsed()}] plan: ${e.paragraphs} paragraphs\n${e.items.map((i) => `    - ${i}`).join("\n")}`);
      }
      if (e.type === "block" && e.block.kind === "paragraph") console.log(`[${elapsed()}] finished paragraph ${e.index - 1}`);
      if (e.type === "check") console.log(`[${elapsed()}] check ready`);
      if (e.type === "error") console.error(`[${elapsed()}] error: ${e.message}${e.detail ? ` (${e.detail})` : ""}`);
    });
    const result = await outcome.run.promise;
    if (!result.ok) process.exit(1);
    letter = result.letter;
    console.log("");
  }
  console.log(formatLetter(letter));
  console.log(`\nRESUME SOURCE: ${letter.resumeSource}`);
  console.log(`STYLE USED: tone ${letter.styleUsed.tone ? "yes" : "no"}, letter summary ${letter.styleUsed.letterSummary ? "yes" : "no"}`);
  console.log(`WORDS: ${letter.wordCount} in ${letter.paragraphs.length} paragraphs`);
  console.log(`CHECK: ${letter.check.verified ? "verified, nothing added" : "NOT verified"}`);
  console.log(...(letter.check.newItems.length ? [letter.check.newItems.map((i) => `- new ${i.kind}: "${i.value}" (${i.where})`).join("\n")] : []));
  if (letter.warnings.length) console.log(`WARNINGS\n${letter.warnings.map((w) => `- ${w}`).join("\n")}`);
  console.log(`\n[cover] cost $${letter.costUsd} · ${(letter.durationMs / 1000).toFixed(1)}s · ${letter.usage.inputTokens} in / ${letter.usage.outputTokens} out tokens`);
}

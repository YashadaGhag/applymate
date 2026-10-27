import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getJobsStore, getResumesStore, getTailoredStore, updateTailoredStore } from "../store/store.js";
import { tailorResume, TAILORING_VERSION, TailoringError } from "./tailorResume.js";
import { checkTailoredDraft } from "./tailorCheck.js";
import { describeChanges } from "./tailorChanges.js";
import { estimateCostUsd } from "./client.js";

// Saved-draft key: job id + resume version + TAILORING_VERSION.
export function draftKey(jobId, resumeVersion) {
  return `${jobId}|${resumeVersion}|${TAILORING_VERSION}`;
}

/** A request that can't start a tailoring call (unknown job, closed job, no resume). */
export class TailoringRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "TailoringRequestError";
    this.status = status;
    this.code = code;
  }
}

// Calls in flight in this process, by draft key. A second click on the same job joins the
// running call (it gets every event so far, then the rest) instead of starting another.
const inFlight = new Map();

function currentResume() {
  const resumes = getResumesStore();
  const resumeVersion = resumes.currentVersion;
  return { resumeVersion, resumeText: resumeVersion ? resumes.versions[resumeVersion]?.text ?? null : null };
}

/** The saved draft for this job and the current resume, if any. Never makes a call. */
export function getSavedDraft(jobId) {
  const { resumeVersion } = currentResume();
  if (!resumeVersion) return { draft: null, inFlight: false };
  const key = draftKey(jobId, resumeVersion);
  return { draft: getTailoredStore().drafts[key] ?? null, inFlight: inFlight.has(key) };
}

/**
 * Called only from the user's click (POST route) or the tailor:job script.
 * Returns { status: "cached", draft } when a draft is already saved (no call),
 * { status: "joined", run } when a call for this job is already running, or
 * { status: "started", run } after starting the one call. run.subscribe(listener) replays the
 * events so far and follows the rest; run.promise resolves to { ok, draft } or { ok: false, error }
 * and never rejects. Nothing retries: a failed run saves nothing, and the next click tries again.
 */
export function startTailoring(jobId) {
  const { resumeVersion, resumeText } = currentResume();
  if (!resumeVersion || !resumeText) {
    throw new TailoringRequestError(409, "no_resume", "Upload a resume before tailoring.");
  }
  const key = draftKey(jobId, resumeVersion);
  const saved = getTailoredStore().drafts[key];
  if (saved) return { status: "cached", draft: saved };
  const running = inFlight.get(key);
  if (running) return { status: "joined", run: running };

  const { jobs } = getJobsStore();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw new TailoringRequestError(404, "not_found", "No job with that id.");
  if (job.closed) throw new TailoringRequestError(409, "job_closed", "This job is no longer accepting applications.");

  const run = createRun({ key, job, resumeText, resumeVersion, knownCompanies: companyNames(jobs) });
  inFlight.set(key, run);
  run.promise.then(() => inFlight.delete(key));
  return { status: "started", run };
}

// Every company name ApplyMate knows of, so the check can spot one the resume never mentions.
function companyNames(jobs) {
  return [...new Set(jobs.map((j) => j.company?.name?.trim()).filter(Boolean))];
}

function createRun({ key, job, resumeText, resumeVersion, knownCompanies }) {
  const events = [];
  const listeners = new Set();
  const emit = (event) => {
    events.push(event);
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn(`[tailor] listener failed: ${err.message}`);
      }
    }
  };
  const subscribe = (listener) => {
    for (const event of events) listener(event);
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const startedAt = Date.now();
  const promise = (async () => {
    emit({ type: "start", jobId: job.id, cached: false, tailoringVersion: TAILORING_VERSION });
    try {
      const result = await tailorResume({ job, resumeText, resumeVersion, emit });
      const changes = describeChanges({ blocks: result.blocks, resumeText });
      emit({ type: "changes", items: changes });
      const check = checkTailoredDraft({ blocks: result.blocks, resumeText, knownCompanies });
      emit({ type: "check", verified: check.verified, newItems: check.newItems });

      const draft = {
        jobId: job.id,
        resumeVersion,
        tailoringVersion: TAILORING_VERSION,
        createdAt: new Date().toISOString(),
        model: result.model,
        job: { title: job.title, company: job.company?.name ?? null },
        blocks: result.blocks,
        changes,
        gaps: result.gaps,
        check: { verified: check.verified, newItems: check.newItems },
        warnings: [...result.warnings, ...check.warnings],
        usage: { inputTokens: result.usage?.input_tokens ?? 0, outputTokens: result.usage?.output_tokens ?? 0 },
        costUsd: estimateCostUsd(result.model, result.usage),
        durationMs: Date.now() - startedAt,
      };
      updateTailoredStore((s) => ({ ...s, drafts: { ...s.drafts, [key]: draft } }));
      emit({ type: "done", draft });
      return { ok: true, draft };
    } catch (err) {
      // API failures are already in ai-usage.jsonl (with tokens used so far).
      const message = err instanceof TailoringError ? err.message : "The tailoring call failed. Nothing was saved; you can try again.";
      console.warn(`[tailor] ${job.id} (${job.title}) failed: ${err.message}`);
      emit({ type: "error", message, detail: err instanceof TailoringError ? null : err.message });
      return { ok: false, error: err };
    }
  })();

  return { subscribe, promise };
}

/**
 * Plain-text rendering of a draft's resume (no What changed, gaps or check). Also the resume text
 * a cover letter is written from when it uses the saved draft (server/ai/runCoverLetter.js).
 */
export function formatBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.kind === "header") {
      out.push(b.name, ...(b.headline ? [b.headline] : []), ...b.contact, "");
      continue;
    }
    const prev = blocks[blocks.indexOf(b) - 1];
    if (!(b.kind === "role" && prev?.kind === "role" && prev.section === b.section)) out.push(b.section.toUpperCase());
    if (b.kind === "summary") out.push(...b.paragraphs);
    if (b.kind === "role") {
      out.push(`${b.title} | ${b.organization}${b.location ? `, ${b.location}` : ""} | ${b.dates}`);
      out.push(...b.bullets.map((x) => `- ${x}`));
    }
    if (b.kind === "education") {
      for (const e of b.entries) {
        out.push([e.degree, e.institution, e.location, e.dates].filter(Boolean).join(" | "));
        out.push(...e.details.map((x) => `- ${x}`));
      }
    }
    if (b.kind === "skills") out.push(...b.groups.map((g) => (g.label ? `${g.label}: ` : "") + g.items.join(", ")));
    if (b.kind === "other") {
      for (const e of b.entries) {
        out.push([e.title, e.subtitle, e.dates].filter(Boolean).join(" | "));
        out.push(...e.bullets.map((x) => `- ${x}`));
      }
    }
    out.push("");
  }
  return out.join("\n").trim();
}

/** Plain-text rendering of a draft, for the script's output and quick reading. */
export function formatDraft(draft) {
  const out = [formatBlocks(draft.blocks), ""];
  out.push("WHAT CHANGED", ...draft.changes.map((c) => `- ${c}`), "");
  out.push("GAPS TO REVIEW", ...(draft.gaps.length ? draft.gaps.map((g) => `- ${g.text}  [posting: "${g.quote}"]`) : ["(none)"]), "");
  out.push(`CHECK: ${draft.check.verified ? "verified, nothing added" : "NOT verified"}`);
  out.push(...draft.check.newItems.map((i) => `- new ${i.kind}: "${i.value}" (${i.where})`));
  if (draft.warnings.length) out.push("", "WARNINGS", ...draft.warnings.map((w) => `- ${w}`));
  return out.join("\n");
}

// npm run tailor:job -- <jobId>
// Same call as the route: returns the saved draft with no call when one exists.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  dotenv.config();
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: npm run tailor:job -- <jobId>");
    process.exit(1);
  }
  let outcome;
  try {
    outcome = startTailoring(jobId);
  } catch (err) {
    console.error(`[tailor] ${err.message}`);
    process.exit(1);
  }
  let draft;
  if (outcome.status === "cached") {
    console.log("[tailor] Saved draft found; no API call made.\n");
    draft = outcome.draft;
  } else {
    const startedAt = Date.now();
    const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
    outcome.run.subscribe((e) => {
      if (e.type === "thinking") console.log(`[${elapsed()}] model started`);
      if (e.type === "block_start") console.log(`[${elapsed()}] writing ${e.kind} (${e.section})`);
      if (e.type === "block") console.log(`[${elapsed()}] finished ${e.block.kind}${e.block.title ? `: ${e.block.title}` : ""}`);
      if (e.type === "changes" || e.type === "gaps" || e.type === "check") console.log(`[${elapsed()}] ${e.type} ready`);
      if (e.type === "error") console.error(`[${elapsed()}] error: ${e.message}${e.detail ? ` (${e.detail})` : ""}`);
    });
    const result = await outcome.run.promise;
    if (!result.ok) process.exit(1);
    draft = result.draft;
    console.log("");
  }
  console.log(formatDraft(draft));
  console.log(`\n[tailor] cost $${draft.costUsd} · ${(draft.durationMs / 1000).toFixed(1)}s · ${draft.usage.inputTokens} in / ${draft.usage.outputTokens} out tokens`);
}

import { getState, updateState } from "../store/store.js";
import { appendAiUsage } from "../store/store.js";
import { acquireRunLock } from "../store/runLock.js";
import { scoreJobs, DEFAULT_MAX_CALLS } from "./runScoring.js";
import { getScoringStatus } from "./replaceResume.js";

// "Refresh" after a Details edit (Job Recommendations banner, Figma "Refresh after edit - Banner").
//
// A Details edit can leave scores out of date: years are part of the scoring cache key (a years
// edit makes every existing score stale), and the prefilter reads roles, locations and relocation
// (an edit can make jobs eligible that were never scored). The server remembers that an edit that
// matters happened (`scoringRefresh.pending`, in data/store.json, so it survives a reload) and the
// page asks whether there is still something to score. Refresh is a person's click, like Score now:
// it scores exactly the eligible jobs that have no current score (stale years and newly eligible),
// through the same scoreJobs() (Sonnet, the scoring cache, the prefilter, the 150-call ceiling, no
// retries inside a run), under the shared run lock.
//
// scoringRefresh: { pending, editedAt, state: "idle" | "running" | "failed", startedAt, finishedAt,
//                   calls, message }

// Which Details fields can change a score or which jobs are scored:
//   yearsOfExperience  the scoring cache key (profile years win when the profile belongs to the resume)
//   roles              the prefilter's title match
//   locations          the prefilter's location rule
//   relocation         the prefilter's location rule ("yes" widens it to the whole US)
// Not these: workTypes (only a ranking penalty, never a filter or a score input), workAuth
// (only the sponsorship flag and ranking), websites (not used), and the resume values.
const norm = (s) => String(s ?? "").trim().toLowerCase();
const locationKey = (loc) => norm(typeof loc === "string" ? loc : loc?.label);

export function scoringFingerprint(profile) {
  return JSON.stringify({
    years: Number.isInteger(profile?.yearsOfExperience) ? profile.yearsOfExperience : null,
    roles: [...new Set((profile?.roles ?? []).map(norm).filter(Boolean))].sort(),
    locations: [...new Set((profile?.locations ?? []).map(locationKey).filter(Boolean))].sort(),
    relocation: profile?.relocation ?? null,
  });
}

/** Did this profile edit change anything that scoring or eligibility reads? */
export function profileEditAffectsScoring(before, after) {
  return scoringFingerprint(before) !== scoringFingerprint(after);
}

export class RefreshError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let runInProgress = false;
let liveCalls = 0;

const getRecord = () => getState().scoringRefresh ?? null;
const setRecord = (patch) =>
  updateState((s) => ({ ...s, scoringRefresh: { ...(s.scoringRefresh ?? {}), ...patch } }));

/**
 * Called by PUT /api/profile only when the save came from a Details dialog (`?edit=details`; the
 * Role page's write-through never does). Remembers that scores may be out of date when the edit
 * changed anything scoring or eligibility reads.
 */
export function noteProfileEdit(before, after) {
  if (!profileEditAffectsScoring(before, after)) return false;
  setRecord({ pending: true, editedAt: new Date().toISOString() });
  return true;
}

/**
 * How many eligible jobs have no current score for the active resume (stale years, or never scored)
 * and haven't been given up on: exactly what a scoring run would score. A dry run of scoreJobs, so it
 * is the same selection (prefilter, cache key, given-up rule) and makes no call.
 */
export async function countJobsNeedingScore() {
  const report = await scoreJobs({ dryRun: true });
  return report.status === "dry-run" ? report.toScore : 0;
}

/**
 * What the Job Recommendations banner shows: { state: "none" | "ready" | "running" | "failed",
 * needed, startedAt, finishedAt, calls, message }. "ready" and "failed" only while an edit that
 * matters is waiting AND some job still needs scoring, so an edit that changed nothing that
 * matters, or scores that became current some other way, show nothing. While a Score new resume run
 * is waiting, running or failed, the answer is "none": that run already uses the current details.
 * A read only: it makes no call. (When nothing is left to score it also clears the waiting flag, so
 * jobs a later scrape adds can't revive the banner.)
 */
export async function getRefreshStatus() {
  const rec = getRecord();
  const none = { state: "none", needed: 0, startedAt: null, finishedAt: null, calls: null, message: null };
  if (!rec?.pending) return none;
  if (["ready", "running", "failed"].includes(getScoringStatus().state)) return none;

  if (rec.state === "running") {
    if (runInProgress) {
      return { state: "running", needed: 0, startedAt: rec.startedAt ?? null, finishedAt: null, calls: liveCalls, message: null };
    }
    // Left "running" by a process that is gone: it can't finish.
    setRecord({ state: "failed", finishedAt: new Date().toISOString(), message: "The server stopped during the last refresh." });
    return getRefreshStatus();
  }

  const needed = await countJobsNeedingScore();
  if (needed === 0) {
    setRecord({ pending: false, state: "idle" });
    return none;
  }
  return {
    state: rec.state === "failed" ? "failed" : "ready",
    needed,
    startedAt: rec.startedAt ?? null,
    finishedAt: rec.finishedAt ?? null,
    calls: rec.calls ?? null,
    message: rec.state === "failed" ? rec.message ?? null : null,
  };
}

function logRun({ startedAt, finishedAt, calls, outcome, costUsd = null, message = null }) {
  appendAiUsage({
    at: finishedAt,
    task: "refresh-scoring-run",
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
    calls,
    outcome,
    estimatedCostUsd: costUsd,
    ...(message ? { message } : {}),
  });
}

async function runRefresh(startedAt) {
  let costUsd = null;
  const fail = (message) => {
    const finishedAt = new Date().toISOString();
    setRecord({ state: "failed", finishedAt, calls: liveCalls, message });
    logRun({ startedAt, finishedAt, calls: liveCalls, outcome: "failed", costUsd, message });
    console.warn(`[refresh-scores] failed after ${liveCalls} call(s): ${message}`);
  };
  try {
    const report = await scoreJobs({
      maxCalls: DEFAULT_MAX_CALLS,
      abortOnApiError: true,
      onCall: () => {
        liveCalls += 1;
      },
    });
    costUsd = report.costUsd ?? null;
    if (report.status !== "ok") return fail(report.reason ?? "Scoring couldn't start.");
    if (report.aborted) return fail(`Scoring stopped: ${report.aborted}`);
    if (report.leftByCeiling > 0) {
      return fail(`Scoring reached the ${DEFAULT_MAX_CALLS}-call limit with ${report.leftByCeiling} job(s) left. Try again to score the rest (what's done is kept).`);
    }
    const finishedAt = new Date().toISOString();
    // Done answers the edits made before this run started; an edit made during it stays waiting.
    updateState((s) => {
      const rec = s.scoringRefresh ?? {};
      const editedDuring = rec.editedAt && rec.editedAt > startedAt;
      return { ...s, scoringRefresh: { ...rec, pending: Boolean(editedDuring), state: "idle", finishedAt, calls: liveCalls, message: null } };
    });
    logRun({ startedAt, finishedAt, calls: liveCalls, outcome: "done", costUsd });
    console.log(`[refresh-scores] scored ${report.scored.length} job(s), ${report.failed.length} rejected, ${liveCalls} call(s), $${report.costUsd}`);
  } catch (err) {
    fail(err.message);
  }
}

/**
 * POST /api/scoring/refresh/start: the person's click on Refresh (or Try again). Scores every
 * eligible job without a current score, through the shared run lock. Returns { state: "running",
 * startedAt } at once; the run goes on if the page closes. Throws RefreshError 409: already
 * running (this flow, a scrape or any scoring run holds the lock), or nothing to refresh.
 */
export async function startRefresh() {
  if (runInProgress) throw new RefreshError(409, "run_in_progress", "Your scores are already being refreshed.");
  const status = await getRefreshStatus();
  if (status.state !== "ready" && status.state !== "failed") {
    throw new RefreshError(409, "nothing_to_refresh", "There is nothing to refresh.");
  }
  const lock = acquireRunLock("score");
  if (!lock.ok) {
    throw new RefreshError(409, "run_in_progress", `A ${lock.holder?.kind ?? "scrape or scoring"} run is already in progress. Try again when it finishes.`);
  }
  const startedAt = new Date().toISOString();
  try {
    setRecord({ state: "running", startedAt, finishedAt: null, calls: 0, message: null });
  } catch (err) {
    lock.release();
    throw err;
  }
  runInProgress = true;
  liveCalls = 0;
  return {
    state: "running",
    startedAt,
    // The run itself, for the tests to await. The route doesn't wait for it.
    finished: runRefresh(startedAt).finally(() => {
      runInProgress = false;
      lock.release();
    }),
  };
}

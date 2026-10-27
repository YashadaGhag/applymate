// DEV ONLY. A pretend state for GET /api/jobs/update-status, written by `npm run dev:update-state`
// (server/dev/forceUpdateState.js) so the Job Recommendations banners and toast can be seen without
// a scrape, a scoring run or any AI call. The file holds the pretend state and, for "running", when
// it ends and how; the state is worked out at read time, so no process has to stay alive. The route
// ignores it whenever a REAL scheduled run is going on (see routes/updateStatus.js).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function overridePath() {
  const dataDir = process.env.APPLYMATE_DATA_DIR
    ? path.resolve(process.env.APPLYMATE_DATA_DIR)
    : path.join(__dirname, "..", "..", "data");
  return path.join(dataDir, "dev-update-state.json");
}

export function readOverride() {
  try {
    return JSON.parse(fs.readFileSync(overridePath(), "utf-8"));
  } catch {
    return null;
  }
}

const idleBase = { phase: null, failedPhase: null, newJobs: 0, message: null, devForced: true };

/**
 * The status the pretend record describes at `nowMs`, or null when there is none.
 * record: { state: "idle" | "running" | "failed" | "done", startedAt, finishedAt, newJobs,
 *           endsAt, then: "done" | "failed" }  (endsAt and then only for "running")
 */
export function overrideStatus(record, nowMs = Date.now()) {
  if (!record) return null;
  const newJobs = Number.isInteger(record.newJobs) && record.newJobs > 0 ? record.newJobs : 0;
  const { state } = record;

  if (state === "running") {
    const endsAt = new Date(record.endsAt).getTime();
    if (nowMs < endsAt) {
      const startedAt = new Date(record.startedAt).getTime();
      // Scraping for the first half, scoring for the second (a real run is the same two phases).
      const phase = nowMs < startedAt + (endsAt - startedAt) / 2 ? "scraping" : "scoring";
      return { ...idleBase, state: "running", phase, startedAt: record.startedAt, finishedAt: null, outcome: null };
    }
    return finished(record.then === "failed" ? "failed" : "done", record.startedAt, record.endsAt, newJobs);
  }
  if (state === "failed" || state === "done") return finished(state, record.startedAt, record.finishedAt, newJobs);
  if (state === "idle") return { ...idleBase, state: "idle", startedAt: null, finishedAt: null, outcome: null };
  return null;
}

function finished(outcome, startedAt, finishedAt, newJobs) {
  return outcome === "failed"
    ? { ...idleBase, state: "failed", startedAt, finishedAt, outcome: "failed", failedPhase: "scraping", message: "Dev state set to failed." }
    : { ...idleBase, state: "idle", startedAt, finishedAt, outcome: "done", newJobs };
}

// DEV ONLY. Makes GET /api/jobs/update-status report a pretend state, so the Job Recommendations
// banners and the "New jobs added" toast can be seen. No scrape, no scoring, no AI call, nothing
// else changes. It never takes the run lock and refuses while a real run holds it. The API ignores
// the pretend state whenever a real scheduled run is in progress. Writes data/dev-update-state.json.
//
//   npm run dev:update-state -- running [--seconds 20] [--new-jobs 3] [--outcome done|failed]
//   npm run dev:update-state -- failed
//   npm run dev:update-state -- done [--new-jobs 3]
//   npm run dev:update-state -- idle      (pretend nothing is going on)
//   npm run dev:update-state -- clear     (remove the pretend state: the real status shows again)
//
// "running" ends by itself after --seconds (default 20): it turns into done (or failed with
// --outcome failed). The toast shows only when the page is open while that happens, and only with
// --new-jobs above 0 (default 3). Needs no API restart and no process left open.
import fs from "node:fs";
import path from "node:path";
import { currentRunHolder } from "../store/runLock.js";
import { overridePath } from "./updateStateOverride.js";

const STATES = ["idle", "running", "failed", "done", "clear"];

function parseArgs(argv) {
  const args = { state: argv[0], seconds: 20, newJobs: 3, outcome: "done" };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--seconds") args.seconds = Number(argv[++i]);
    else if (argv[i] === "--new-jobs") args.newJobs = Number(argv[++i]);
    else if (argv[i] === "--outcome") args.outcome = argv[++i];
  }
  if (!STATES.includes(args.state)) throw new Error(`State must be one of: ${STATES.join(", ")}`);
  if (!Number.isFinite(args.seconds) || args.seconds <= 0) throw new Error("--seconds must be a positive number");
  if (!Number.isInteger(args.newJobs) || args.newJobs < 0) throw new Error("--new-jobs must be a whole number");
  if (!["done", "failed"].includes(args.outcome)) throw new Error("--outcome must be done or failed");
  return args;
}

const args = parseArgs(process.argv.slice(2));
const holder = currentRunHolder();
if (holder) {
  console.error(`[dev] A ${holder.kind} run holds the lock (pid ${holder.pid}). Not touching the status. Try again when it finishes.`);
  process.exit(1);
}

if (args.state === "clear") {
  fs.rmSync(overridePath(), { force: true });
  console.log("[dev] Update status: pretend state removed. The real status shows again.");
} else {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const record =
    args.state === "running"
      ? { state: "running", startedAt: iso(now), endsAt: iso(now + args.seconds * 1000), then: args.outcome, newJobs: args.newJobs }
      : { state: args.state, startedAt: iso(now), finishedAt: iso(now), newJobs: args.state === "done" ? args.newJobs : 0 };
  fs.mkdirSync(path.dirname(overridePath()), { recursive: true });
  fs.writeFileSync(overridePath(), JSON.stringify(record, null, 2));
  console.log(
    args.state === "running"
      ? `[dev] Update status: running for ${args.seconds}s, then ${args.outcome}${args.outcome === "done" ? ` (${args.newJobs} new job(s))` : ""}.`
      : `[dev] Update status: ${args.state}${args.state === "done" ? ` (${args.newJobs} new job(s))` : ""}.`
  );
}

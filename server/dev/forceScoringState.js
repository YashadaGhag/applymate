// DEV ONLY. Puts the "Score new resume" flow into a chosen state so the Job Recommendations page
// and Change Preferences > Resume can be clicked through without uploading a resume or making any
// AI call. Writes a pretend record to data/resumes.json → replacement, marked `devForced: true`.
// "Score now" / "Try again" on a dev record run a pretend 15-second run in the API (no call, no
// scores, no switch) that ends as --outcome says. It never touches a real replacement.
//
//   npm run dev:scoring-state -- ready   [--outcome done|failed] [--modal-seen]
//   npm run dev:scoring-state -- running [--outcome done|failed] [--seconds 30]
//   npm run dev:scoring-state -- failed  [--outcome done|failed]
//   npm run dev:scoring-state -- done    [--done-seen]
//   npm run dev:scoring-state -- none    (removes the dev record)
//
// "running" keeps this script alive for --seconds (default 30) holding the run lock, like a real
// run, then ends the record as --outcome says. Ctrl+C before then leaves it "running" with no
// live process, so the API reports it as failed (interrupted) on the next read.
import { getResumesStore, updateResumesStore } from "../store/store.js";
import { acquireRunLock } from "../store/runLock.js";

const STATES = ["none", "ready", "running", "failed", "done"];

function parseArgs(argv) {
  const args = { state: argv[0], outcome: "done", seconds: 30, modalSeen: false, doneSeen: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--outcome") args.outcome = argv[++i];
    else if (argv[i] === "--seconds") args.seconds = Number(argv[++i]);
    else if (argv[i] === "--modal-seen") args.modalSeen = true;
    else if (argv[i] === "--done-seen") args.doneSeen = true;
  }
  if (!STATES.includes(args.state)) throw new Error(`State must be one of: ${STATES.join(", ")}`);
  if (!["done", "failed"].includes(args.outcome)) throw new Error("--outcome must be done or failed");
  if (!Number.isFinite(args.seconds) || args.seconds <= 0) throw new Error("--seconds must be a positive number");
  return args;
}

const setRecord = (record) => updateResumesStore((s) => ({ ...s, replacement: record }));

const args = parseArgs(process.argv.slice(2));
const existing = getResumesStore().replacement;
if (existing && !existing.devForced && existing.state !== "done") {
  console.error(
    `[dev] A real new resume is ${existing.state} (${existing.fileName}). Not touching it. ` +
      "Discard it first (Cancel in Confirm details, or DELETE /api/resume/replace)."
  );
  process.exit(1);
}

const now = new Date().toISOString();
const base = {
  devForced: true,
  devOutcome: args.outcome,
  version: null,
  fileName: "Dev test resume.pdf",
  createdAt: now,
  modalSeen: args.modalSeen,
};

if (args.state === "none") {
  setRecord(null);
  console.log("[dev] Scoring state: none (dev record removed).");
} else if (args.state === "ready") {
  setRecord({ ...base, state: "ready" });
  console.log(`[dev] Scoring state: ready (modalSeen ${args.modalSeen}). "Score now" runs a pretend 15s run ending ${args.outcome}.`);
} else if (args.state === "failed") {
  setRecord({ ...base, modalSeen: true, state: "failed", startedAt: now, finishedAt: now, calls: 0, message: "Dev run set to fail." });
  console.log(`[dev] Scoring state: failed. "Try again" runs a pretend 15s run ending ${args.outcome}.`);
} else if (args.state === "done") {
  setRecord({ ...base, modalSeen: true, state: "done", startedAt: now, finishedAt: now, calls: 0, doneSeen: args.doneSeen });
  console.log(`[dev] Scoring state: done (doneSeen ${args.doneSeen}). No resume was switched.`);
} else {
  const lock = acquireRunLock("replace-resume");
  if (!lock.ok) {
    console.error(`[dev] A ${lock.holder?.kind} run holds the lock (pid ${lock.holder?.pid}). Try again when it finishes.`);
    process.exit(1);
  }
  setRecord({ ...base, modalSeen: true, state: "running", startedAt: now, finishedAt: null, calls: 0 });
  console.log(`[dev] Scoring state: running for ${args.seconds}s, then ${args.outcome}. Keep this terminal open.`);
  setTimeout(() => {
    const finishedAt = new Date().toISOString();
    const current = getResumesStore().replacement;
    if (current?.devForced && current.state === "running") {
      setRecord({
        ...current,
        state: args.outcome,
        finishedAt,
        ...(args.outcome === "failed" ? { message: "Dev run set to fail." } : { doneSeen: false }),
      });
    }
    lock.release();
    console.log(`[dev] Scoring state: ${args.outcome}.`);
  }, args.seconds * 1000);
}

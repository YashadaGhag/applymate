import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// One scrape / scoring / resume-replacement run at a time. Scrapes and `score:jobs` are separate
// processes from the API server, so the lock is a file (data/run.lock) holding the owner's pid.
// A lock whose process is gone (a crash, a closed terminal) is stale and taken over.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCK_PATH = path.join(
  process.env.APPLYMATE_DATA_DIR ? path.resolve(process.env.APPLYMATE_DATA_DIR) : path.join(__dirname, "..", "..", "data"),
  "run.lock"
);

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, owned by someone else
  }
}

function readHolder() {
  try {
    return JSON.parse(fs.readFileSync(LOCK_PATH, "utf-8"));
  } catch {
    return null;
  }
}

/** The live holder of the lock, or null (a stale lock whose process is gone counts as free). */
export function peekRunLock() {
  const holder = readHolder();
  return holder && isAlive(holder.pid) ? holder : null;
}

/**
 * Tries to take the lock for `kind` ("scrape" | "score" | "replace-resume").
 * Returns { ok: true, release } or { ok: false, holder: { kind, pid, startedAt } }.
 * release() is idempotent and also runs when the process exits.
 */
export function acquireRunLock(kind) {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  const body = JSON.stringify({ kind, pid: process.pid, startedAt: new Date().toISOString() });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(LOCK_PATH, body, { flag: "wx" });
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        process.off("exit", release);
        const holder = readHolder();
        if (holder?.pid === process.pid) {
          try {
            fs.unlinkSync(LOCK_PATH);
          } catch {
            // already gone
          }
        }
      };
      process.on("exit", release);
      return { ok: true, release };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const holder = readHolder();
      if (holder && isAlive(holder.pid)) return { ok: false, holder };
      // Stale (or unreadable): remove it and try once more.
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {
        // someone else removed it first
      }
    }
  }
  return { ok: false, holder: readHolder() };
}

/** The current lock holder, or null when nothing holds it. */
export function currentRunHolder() {
  const holder = readHolder();
  return holder && isAlive(holder.pid) ? holder : null;
}

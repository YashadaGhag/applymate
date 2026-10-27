// Pure rules for the background-update status (GET /api/jobs/update-status), kept apart from the
// hook so they can be tested without a browser.

/** A run this page watched has just ended: the previous read said running, this one does not. */
export function runJustEnded(previous, next) {
  return previous?.state === "running" && next?.state !== "running";
}

/** The "New jobs added" toast: the finished run succeeded and made jobs visible. */
export function shouldAnnounceNewJobs(next) {
  return next?.outcome === "done" && Number.isInteger(next.newJobs) && next.newJobs > 0;
}

// ── Dismissing the failed-update banner ─────────────────────────────────────────────────────────
// Remembered per browser by the failed run's own time, so a later failed run shows it again. Any
// storage problem (blocked, full, private window) just means the banner shows again.
export const DISMISSED_RUN_KEY = "applymate.updateFailedDismissed";

/** The id of a failed run: when it finished (an interrupted run has no finish time: its start). */
export function failedRunKey(status) {
  if (status?.state !== "failed") return null;
  return status.finishedAt ?? status.startedAt ?? null;
}

/** Is this status a failed run the person already dismissed? */
export function isFailedRunDismissed(status, dismissedKey) {
  const key = failedRunKey(status);
  return key !== null && dismissedKey === key;
}

export function readDismissedRun(storage = globalThis.localStorage) {
  try {
    return storage.getItem(DISMISSED_RUN_KEY);
  } catch {
    return null;
  }
}

export function writeDismissedRun(key, storage = globalThis.localStorage) {
  try {
    storage.setItem(DISMISSED_RUN_KEY, key);
  } catch {
    // The banner simply shows again next time.
  }
}

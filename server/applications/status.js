// Application statuses and the changes the person may make (Figma Tracker actions menu 2728:11740).
// Plain code, no I/O, so the routes, the job lists and the tests share one definition.
// archived is a separate boolean on the record, not a status.

export const STATUSES = ["pending", "applied", "interviewing", "offer", "not_moving_forward"];

// status → the statuses it may move to. offer and not_moving_forward are final.
// applied → pending is the one backwards move ("Revert to application pending", for a job marked
// applied by mistake); no other status can go back.
const ALLOWED_CHANGES = {
  pending: ["applied"],
  applied: ["interviewing", "offer", "not_moving_forward", "pending"],
  interviewing: ["offer", "not_moving_forward"],
  offer: [],
  not_moving_forward: [],
};

// Archiving is allowed from these only. There is no unarchive.
const ARCHIVABLE = new Set(["interviewing", "offer", "not_moving_forward"]);

export function isStatus(value) {
  return typeof value === "string" && STATUSES.includes(value);
}

export function canChangeStatus(from, to) {
  return Boolean(ALLOWED_CHANGES[from]?.includes(to));
}

export function canArchive(status) {
  return ARCHIVABLE.has(status);
}

// A job whose application is past "pending" is no longer a recommendation: the Watchlist groups and
// Others drop it. A pending job stays visible.
export function isApplied(status) {
  return isStatus(status) && status !== "pending";
}

/** Ids of the jobs the person has applied to (any status past pending). */
export function appliedJobIds(applications) {
  return new Set(
    Object.values(applications ?? {})
      .filter((record) => isApplied(record?.status))
      .map((record) => record.jobId)
  );
}

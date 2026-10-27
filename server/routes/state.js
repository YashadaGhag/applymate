import { Router } from "express";
import { latestResumeFile } from "../ai/replaceResume.js";
import { getState, updateState, getResumesStore } from "../store/store.js";
import { notifyWatchlistSaved } from "../scheduler/trigger.js";
import { noteProfileEdit } from "../ai/refreshScores.js";

const router = Router();

// lastViewed is not here: the server stamps it itself (PUT /api/user-state/last-viewed/watchlist).
const USER_STATE_KEYS = ["savedJobIds", "dismissedJobIds"];

// Onboarding is complete when a resume exists and the Role answers were saved for it. The profile
// is written through on every onboarding change (not only on Continue), so profile.resumeVersion
// alone only proves an upload. Relocation is the marker for "Role answers saved": it's required,
// only written by the Role page's Continue, and reset to null when a different resume is uploaded.
export function isOnboardingComplete(state) {
  const { currentVersion, versions } = getResumesStore();
  const profile = state.profile;
  return Boolean(
    currentVersion &&
      versions?.[currentVersion] &&
      profile?.resumeVersion === currentVersion &&
      profile.relocation != null
  );
}

/**
 * GET /api/state
 * Returns { schemaVersion, watchlist, companyMeta, profile, userState, meta, onboardingComplete,
 * activeResume: { fileName, hasFile } | null, latestResume: { fileName, hasFile, latestIsNew } | null }.
 * Job data lives in its own store (data/jobs.json, server/store/store.js's getJobsStore)
 * and was never part of this response — no filtering or pagination exists for it yet, so
 * shipping it whole to the browser isn't a boundary we want before /api/jobs exists.
 */
router.get("/state", (req, res) => {
  const state = getState();
  res.json({
    ...state,
    onboardingComplete: isOnboardingComplete(state),
    activeResume: activeResumeInfo(),
    latestResume: latestResumeInfo(),
  });
});

// The latest uploaded resume (the new one while it waits to be scored, is being scored or failed;
// otherwise the active one): what the Resume tab row names, downloaded from GET
// /api/resume/latest-file. latestIsNew says it isn't the active one yet. Never the text.
function latestResumeInfo() {
  const latest = latestResumeFile();
  if (!latest) return null;
  return { fileName: latest.fileName, hasFile: Boolean(latest.storedAs), latestIsNew: latest.latestIsNew };
}

// The active resume's name and whether its original file is stored (GET /api/resume/file), for the
// Change Preferences > Resume tab. Never the text. null before a resume exists.
function activeResumeInfo() {
  const { currentVersion, versions } = getResumesStore();
  const version = currentVersion ? versions[currentVersion] : null;
  if (!version) return null;
  return { fileName: version.fileName ?? null, hasFile: Boolean(version.storedAs) };
}

/**
 * PUT /api/watchlist
 * Body: { items: [{ id, name, domain, isCustom, addedAt }] }
 * Replaces the whole watchlist. No maximum count.
 * After the response is sent, the scheduler (when it is enabled) is told, and detects and scrapes any
 * NEW company in the background (server/scheduler/newCompanies.js). The save never waits for it.
 */
router.put("/watchlist", (req, res) => {
  const { items } = req.body ?? {};

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "Expected body.items to be an array." });
  }

  const seenIds = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object") {
      return res.status(400).json({ error: "Each watchlist item must be an object." });
    }
    if (typeof item.id !== "string" || item.id.length === 0) {
      return res.status(400).json({ error: "Each watchlist item needs a string id." });
    }
    if (seenIds.has(item.id)) {
      return res.status(400).json({ error: `Duplicate watchlist item id: ${item.id}` });
    }
    seenIds.add(item.id);
    if (typeof item.name !== "string" || item.name.length === 0) {
      return res.status(400).json({ error: "Each watchlist item needs a string name." });
    }
    if (item.domain != null && typeof item.domain !== "string") {
      return res.status(400).json({ error: "domain must be a string or null." });
    }
  }

  const normalized = items.map((item) => ({
    id: item.id,
    name: item.name,
    domain: item.domain ?? null,
    isCustom: Boolean(item.isCustom),
    addedAt: typeof item.addedAt === "string" ? item.addedAt : new Date().toISOString(),
  }));

  const next = updateState((state) => ({ ...state, watchlist: normalized }));
  res.json({ watchlist: next.watchlist });
  notifyWatchlistSaved();
});

/**
 * PUT /api/profile
 * Body: the Role page answers, stored as-is (designations, years of
 * experience, locations, work modes, relocation, work authorization,
 * websites). Replaces whatever profile was stored before.
 */
router.put("/profile", (req, res) => {
  const profile = req.body;

  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return res.status(400).json({ error: "Expected a profile object in the request body." });
  }

  const currentVersion = getResumesStore().currentVersion;
  const before = getState().profile;
  const next = updateState((state) => ({ ...state, profile: keepResumeBaseline(state.profile, profile, currentVersion) }));
  // A save from a Details dialog (?edit=details) that changed something scoring reads leaves a
  // "needs refresh" mark for Job Recommendations (see server/ai/refreshScores.js). The Role page's
  // write-through never sends it. Nothing is rescored here.
  if (req.query.edit === "details") noteProfileEdit(before, next.profile);
  res.json({ profile: next.profile });
});

/**
 * resumeVersion and resumeValues (the "Found in resume" baseline) belong to the active resume. The
 * onboarding page writes its whole in-memory profile through on every change, so a page that loaded
 * before a Replace resume switch would send the OLD version and baseline back and undo the switch.
 * A body whose resumeVersion is not the active resume while the stored profile already is on it is
 * stale in those two fields: they keep their stored values (every other field is saved as sent).
 * A real new upload is not affected: POST /api/resume makes the new file the active one first.
 */
function keepResumeBaseline(stored, incoming, currentVersion) {
  const isStale =
    typeof currentVersion === "string" &&
    stored?.resumeVersion === currentVersion &&
    typeof incoming.resumeVersion === "string" &&
    incoming.resumeVersion !== currentVersion;
  if (!isStale) return incoming;
  const kept = { ...incoming, resumeVersion: stored.resumeVersion };
  if (stored.resumeValues === undefined) delete kept.resumeValues;
  else kept.resumeValues = stored.resumeValues;
  return kept;
}

/**
 * PATCH /api/user-state
 * Body: a partial { savedJobIds, dismissedJobIds } — only the provided keys are merged in.
 * lastViewed can't be written here (400): the server stamps it with its own clock.
 */
router.patch("/user-state", (req, res) => {
  const patch = req.body;

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return res.status(400).json({ error: "Expected a userState patch object in the request body." });
  }

  for (const key of Object.keys(patch)) {
    if (!USER_STATE_KEYS.includes(key)) {
      return res.status(400).json({ error: `Unknown userState field: ${key}` });
    }
  }
  if (patch.savedJobIds !== undefined && !Array.isArray(patch.savedJobIds)) {
    return res.status(400).json({ error: "savedJobIds must be an array." });
  }
  if (patch.dismissedJobIds !== undefined && !Array.isArray(patch.dismissedJobIds)) {
    return res.status(400).json({ error: "dismissedJobIds must be an array." });
  }
  const next = updateState((state) => ({
    ...state,
    userState: {
      ...state.userState,
      ...patch,
    },
  }));
  res.json({ userState: next.userState });
});

/**
 * PUT / DELETE /api/user-state/saved/:jobId and /api/user-state/dismissed/:jobId
 * Adds or removes one job id. Per-id and idempotent, so two quick clicks on different jobs can't
 * overwrite each other the way sending whole arrays through PATCH could. Ids are kept even if the
 * job record is later gone; saved and dismissed never touch the job records themselves.
 *
 * Dismissing also unsaves, in the same write; the response's wasSaved says whether it was saved.
 * DELETE .../dismissed/:jobId?restoreSaved=true (UNDO) saves it again in that same write.
 */
const withMembership = (ids, jobId, member) => {
  const without = (ids ?? []).filter((id) => id !== jobId);
  return member ? [...without, jobId] : without;
};

function writeMembership(jobId, changes) {
  let wasSaved = false;
  const next = updateState((state) => {
    const userState = { ...state.userState };
    wasSaved = (userState.savedJobIds ?? []).includes(jobId);
    for (const [key, member] of Object.entries(changes)) {
      userState[key] = withMembership(userState[key], jobId, member);
    }
    // savedAt: when each saved job was saved (the Saved Jobs page's "Saved on"). Stamped only on the
    // write that adds the job, never backdated and never changed by saving again; dropped when it
    // is unsaved. Jobs saved before this existed have no entry. Not writable through PATCH.
    if ("savedJobIds" in changes) {
      const { [jobId]: previous, ...rest } = userState.savedAt ?? {};
      if (!changes.savedJobIds) userState.savedAt = rest;
      else if (previous) userState.savedAt = { ...rest, [jobId]: previous };
      else if (!wasSaved) userState.savedAt = { ...rest, [jobId]: new Date().toISOString() };
      else userState.savedAt = rest; // saved before dates were kept: stays undated
    }
    return { ...state, userState };
  });
  return { userState: next.userState, wasSaved };
}

router.put("/user-state/saved/:jobId", (req, res) => {
  res.json(writeMembership(req.params.jobId, { savedJobIds: true }));
});
router.delete("/user-state/saved/:jobId", (req, res) => {
  res.json(writeMembership(req.params.jobId, { savedJobIds: false }));
});
router.put("/user-state/dismissed/:jobId", (req, res) => {
  res.json(writeMembership(req.params.jobId, { dismissedJobIds: true, savedJobIds: false }));
});
router.delete("/user-state/dismissed/:jobId", (req, res) => {
  const changes = { dismissedJobIds: false };
  if (req.query.restoreSaved === "true") changes.savedJobIds = true;
  res.json(writeMembership(req.params.jobId, changes));
});

/**
 * One-time tips: PUT /api/user-state/<tip>-seen stamps a userState field once (a repeat keeps the
 * first time). There is no way to unset one, and PATCH /api/user-state can't write them. Each is
 * set only when the person clicks "Got it". Returns { userState }.
 *  - customize-tip-seen       → customizeTipSeenAt      ("Customizing resume…", Job Recommendations)
 *  - download-files-tip-seen  → downloadFilesTipSeenAt  (Download Files panel, Job Details)
 *  - mark-applied-tip-seen    → markAppliedTipSeenAt    ("Mark as applied" button, Job Details)
 */
function stampTipSeen(field) {
  return (req, res) => {
    const next = updateState((state) => {
      if (state.userState?.[field]) return state;
      return { ...state, userState: { ...state.userState, [field]: new Date().toISOString() } };
    });
    res.json({ userState: next.userState });
  };
}
router.put("/user-state/customize-tip-seen", stampTipSeen("customizeTipSeenAt"));
router.put("/user-state/download-files-tip-seen", stampTipSeen("downloadFilesTipSeenAt"));
router.put("/user-state/mark-applied-tip-seen", stampTipSeen("markAppliedTipSeenAt"));

/**
 * PUT /api/user-state/last-viewed/watchlist: the red dot on the Watchlist tab (see GET /api/jobs).
 * Stamps userState.lastViewed.watchlist with the SERVER's clock; the body is ignored, so the
 * browser can never choose the time, and PATCH can't write it. The page sends it when the person
 * leaves Job Recommendations, never on arrival. With ?ifUnset=true it only stamps when nothing is
 * stored yet (the first visit: "now", so there is no dot on day one) and otherwise changes nothing.
 * No scrape, scoring or AI call. Returns { userState }.
 */
router.put("/user-state/last-viewed/watchlist", (req, res) => {
  const ifUnset = req.query.ifUnset === "true";
  const next = updateState((state) => {
    const lastViewed = state.userState?.lastViewed ?? {};
    if (ifUnset && lastViewed.watchlist) return state;
    return { ...state, userState: { ...state.userState, lastViewed: { ...lastViewed, watchlist: new Date().toISOString() } } };
  });
  res.json({ userState: next.userState });
});

export default router;

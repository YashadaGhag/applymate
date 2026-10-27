// Run with: node --test server/ai/replaceResume.test.js
// No network and no model calls: the mismatch check runs on fixture extractions, the routes are
// only hit with requests that fail before any call, and ANTHROPIC_API_KEY is removed so a stray
// call would throw instead of spending.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

// Everything below runs against a temp data folder, never the real data/.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
const readData = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf-8"));

const { checkMismatch, activateReplacement, recoverInterruptedReplacement, getReplacementStatus } = await import("./replaceResume.js");
const { validateProfilePatch, mergeProfile } = await import("./profilePatch.js");
const { acquireRunLock, currentRunHolder } = await import("../store/runLock.js");
const { default: resumeRouter } = await import("../routes/resume.js");

const profile = {
  roles: ["Senior Product Designer", "UX Designer"],
  yearsOfExperience: 7,
  locations: [{ label: "Austin, Texas", city: "Austin", region: "Texas", countryCode: "US" }],
};
const oldFields = { designation: "Senior Product Designer", adjacentRoles: ["Senior UX Designer"], yearsOfExperience: 7, location: "Seattle, WA" };
const reasonCodes = (newFields, p = profile, o = oldFields) => checkMismatch({ profile: p, oldFields: o, newFields }).reasons.map((r) => r.code);

test("an ordinary new resume needs no confirmation", () => {
  const out = checkMismatch({ profile, oldFields, newFields: { designation: "Product Designer", adjacentRoles: [], yearsOfExperience: 8, location: "Seattle, WA" } });
  assert.deepEqual(out, { reasons: [], needsConfirmation: false });
});

test("years: a difference of 2 or more is flagged, 1 is not, missing is not", () => {
  const base = { designation: "Product Designer", adjacentRoles: [], location: "Seattle, WA" };
  assert.deepEqual(reasonCodes({ ...base, yearsOfExperience: 9 }), ["years"]);
  assert.deepEqual(reasonCodes({ ...base, yearsOfExperience: 5 }), ["years"]);
  assert.deepEqual(reasonCodes({ ...base, yearsOfExperience: 8 }), []);
  assert.deepEqual(reasonCodes({ ...base, yearsOfExperience: null }), []);
  assert.deepEqual(reasonCodes({ ...base, yearsOfExperience: 12 }, { ...profile, yearsOfExperience: null }), []);
});

test("designation: the prefilter's phrase rule, levels ignored, adjacent roles count", () => {
  const base = { yearsOfExperience: 7, location: "Seattle, WA" };
  assert.deepEqual(reasonCodes({ ...base, designation: "Lead UX Designer II", adjacentRoles: [] }), []); // "UX Designer" chip
  assert.deepEqual(reasonCodes({ ...base, designation: "Software Engineer", adjacentRoles: ["Product Designer"] }), []);
  assert.deepEqual(reasonCodes({ ...base, designation: "Software Engineer", adjacentRoles: ["Backend Engineer"] }), ["designation"]);
  // Nothing extracted to compare, or no chips to compare: never a reason.
  assert.deepEqual(reasonCodes({ ...base, designation: null, adjacentRoles: [] }), []);
  assert.deepEqual(reasonCodes({ ...base, designation: "Software Engineer", adjacentRoles: [] }, { ...profile, roles: [] }), []);
});

test("location: header city or region differing is flagged; missing is not; profile locations are not compared", () => {
  const base = { designation: "Product Designer", adjacentRoles: [], yearsOfExperience: 7 };
  assert.deepEqual(reasonCodes({ ...base, location: "Portland, OR" }), ["location"]);
  assert.deepEqual(reasonCodes({ ...base, location: "Seattle, WA" }), []);
  assert.deepEqual(reasonCodes({ ...base, location: null }), []);
  assert.deepEqual(reasonCodes({ ...base, location: "Portland, OR" }, profile, { ...oldFields, location: null }), []);
  // Both resumes say Seattle while the profile wants Austin: no flag (desired locations aren't compared).
  assert.deepEqual(reasonCodes({ ...base, location: "Seattle, WA" }), []);
});

test("profile patch validation mirrors the Details dialogs", () => {
  const ok = (p) => validateProfilePatch(p).ok;
  assert.equal(ok({ roles: ["Product Designer"], yearsOfExperience: 7, relocation: "no" }), true);
  assert.equal(ok({ yearsOfExperience: 51 }), false);
  assert.equal(ok({ yearsOfExperience: 2.5 }), false);
  assert.equal(ok({ yearsOfExperience: null }), true);
  assert.equal(ok({ roles: ["a", "A"] }), false);
  assert.equal(ok({ roles: ["1", "2", "3", "4", "5", "6"] }), false);
  assert.equal(ok({ relocation: null }), false); // required
  assert.equal(ok({ workAuth: "Made up" }), false);
  assert.equal(ok({ workAuth: "U.S. citizen" }), true);
  assert.equal(ok({ workTypes: { remote: true, onsite: false } }), false);
  assert.equal(ok({ websites: { linkedin: "linkedin.com/in/x", portfolio: "", additional: [] } }), true);
  assert.equal(ok({ websites: { linkedin: "example.com", portfolio: "", additional: [] } }), false); // not a LinkedIn URL
  assert.equal(ok({ websites: { linkedin: "", portfolio: "a@b.com", additional: [] } }), false);
  assert.equal(ok({ resumeVersion: "x" }), false); // not an editable field
  assert.equal(ok("nope"), false);
});

test("merging a patch keeps every other field; no US location empties work authorization", () => {
  const stored = { resumeVersion: "abc", relocation: "yes", workAuth: "U.S. citizen", websites: { linkedin: "l", portfolio: "", additional: [] }, workTypes: { remote: true, onsite: false, hybrid: false }, roles: ["x"] };
  const merged = mergeProfile(stored, { yearsOfExperience: 9 });
  assert.deepEqual({ ...merged, yearsOfExperience: undefined }, { ...stored, yearsOfExperience: undefined });
  assert.equal(merged.yearsOfExperience, 9);
  assert.equal(mergeProfile(stored, { locations: [{ label: "London, UK", countryCode: "GB" }] }).workAuth, null);
  assert.equal(mergeProfile(stored, { locations: [{ label: "Austin, Texas", countryCode: "US" }] }).workAuth, "U.S. citizen");
});

test("run lock: one holder at a time, released on release(), a dead pid's lock is taken over", () => {
  const first = acquireRunLock("replace-resume");
  assert.equal(first.ok, true);
  const second = acquireRunLock("scrape");
  assert.equal(second.ok, false);
  assert.equal(second.holder.kind, "replace-resume");
  first.release();
  assert.equal(currentRunHolder(), null);

  const lockPath = path.join(dataDir, "run.lock");
  fs.writeFileSync(lockPath, JSON.stringify({ kind: "scrape", pid: 99999999, startedAt: new Date().toISOString() }));
  const takeover = acquireRunLock("score");
  assert.equal(takeover.ok, true);
  takeover.release();
  assert.equal(fs.existsSync(lockPath), false);
});

// ─── Routes: only requests that fail (or answer) before any model call ──────────────────────────

async function withApp(fn) {
  const app = express();
  app.use(express.json());
  app.use("/api", resumeRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const upload = (base, body, fileName) =>
  fetch(`${base}/resume/replace`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", ...(fileName ? { "X-File-Name": encodeURIComponent(fileName) } : {}) },
    body,
  });

test("routes fail before any model call", async () => {
  await withApp(async (base) => {
    // A file type that can't be read: 400, nothing stored.
    let res = await upload(base, Buffer.from("hello"), "resume.txt");
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "unsupported_file");
    // No file name, no body.
    assert.equal((await upload(base, Buffer.from("hello"), null)).status, 400);
    assert.equal((await upload(base, Buffer.alloc(0), "resume.pdf")).status, 400);
    // Confirm with nothing pending, and a bad patch: nothing starts.
    res = await fetch(`${base}/resume/replace/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.ok([404, 409].includes(res.status));
    // Status and discard answer without a call.
    res = await fetch(`${base}/resume/replace`);
    assert.equal(res.status, 200);
    assert.ok(["idle", "ready", "needs_confirmation", "failed", "done"].includes((await res.json()).state));
  });
});

test("the switch: scores merged, resume and profile point to the new one, resumeValues rebuilt, old file deleted", () => {
  const filesDir = path.join(dataDir, "resume-files");
  fs.mkdirSync(filesDir, { recursive: true });
  fs.writeFileSync(path.join(filesDir, "resume-old.pdf"), "old");
  fs.writeFileSync(path.join(filesDir, "resume-new.pdf"), "new");
  writeData("resumes.json", {
    currentVersion: "old",
    versions: {
      old: { version: "old", fileName: "old.pdf", storedAs: "resume-old.pdf", text: "old text", extraction: { fields: { designation: "Old" } } },
      new: {
        version: "new", fileName: "new.pdf", storedAs: "resume-new.pdf", text: "new text",
        extraction: { fields: { designation: "Senior Product Designer", adjacentRoles: ["Senior UX Designer"], yearsOfExperience: 8, location: "Seattle, WA" } },
      },
    },
    replacement: { state: "running", version: "new", fileName: "new.pdf" },
  });
  writeData("scores.json", {
    scores: { a: { resumeVersion: "old", score: 60 }, b: { resumeVersion: "old", score: 70 } },
    failures: {},
    pending: { resumeVersion: "new", scores: { a: { resumeVersion: "new", score: 80 } }, failures: {} },
  });
  writeData("store.json", { profile: { resumeVersion: "old", relocation: "yes", roles: ["Product Designer"], resumeValues: { roles: ["Old"], yearsOfExperience: 3 } } });

  activateReplacement("new");

  const resumes = readData("resumes.json");
  assert.equal(resumes.currentVersion, "new");
  assert.equal(resumes.versions.old.storedAs, null);
  assert.equal(fs.existsSync(path.join(filesDir, "resume-old.pdf")), false);
  assert.equal(fs.existsSync(path.join(filesDir, "resume-new.pdf")), true);
  assert.equal(resumes.replacement.state, "done");
  const scores = readData("scores.json");
  assert.equal(scores.scores.a.resumeVersion, "new"); // replaced by the new score
  assert.equal(scores.scores.b.resumeVersion, "old"); // nothing replaced it: kept, never shown
  assert.equal(scores.pending, null);
  const { profile } = readData("store.json");
  assert.equal(profile.resumeVersion, "new");
  assert.equal(profile.relocation, "yes"); // answers kept
  assert.deepEqual(profile.roles, ["Product Designer"]);
  assert.deepEqual(profile.resumeValues, { roles: ["Senior Product Designer", "Senior UX Designer"], yearsOfExperience: 8 });
});

test("a replacement left running by a dead server is marked failed at start; a live replace lock is left alone", () => {
  const running = { state: "running", version: "new", fileName: "new.pdf", current: {}, fromResume: {} };
  writeData("resumes.json", { currentVersion: "old", versions: { old: {}, new: {} }, replacement: running });
  assert.equal(currentRunHolder(), null); // no lock file at all
  assert.equal(recoverInterruptedReplacement(), true);
  const status = getReplacementStatus();
  assert.equal(status.state, "failed");
  assert.match(status.message, /interrupted/);

  // A lock whose process is gone counts as missing.
  writeData("resumes.json", { currentVersion: "old", versions: { old: {}, new: {} }, replacement: running });
  fs.writeFileSync(path.join(dataDir, "run.lock"), JSON.stringify({ kind: "replace-resume", pid: 99999999, startedAt: new Date().toISOString() }));
  assert.equal(recoverInterruptedReplacement(), true);

  // A live holder of the replace lock (another server process) is left alone.
  writeData("resumes.json", { currentVersion: "old", versions: { old: {}, new: {} }, replacement: running });
  const lock = acquireRunLock("replace-resume");
  assert.equal(recoverInterruptedReplacement(), false);
  assert.equal(readData("resumes.json").replacement.state, "running");
  lock.release();

  // Nothing to recover when nothing is running.
  writeData("resumes.json", { currentVersion: "old", versions: {}, replacement: null });
  assert.equal(recoverInterruptedReplacement(), false);
});

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

// ─── "Found in resume" baseline (profile.resumeValues) ───────────────────────────────────────────

const { confirmReplacement, startScoring } = await import("./replaceResume.js");
const { default: stateRouter } = await import("../routes/state.js");

const NOW_ISO = new Date().toISOString();
const oldExtraction = { designation: "Old Designer", adjacentRoles: [], yearsOfExperience: 3, location: "Seattle, WA" };
const newExtraction = { designation: "Senior Product Designer", adjacentRoles: ["Senior UX Designer"], yearsOfExperience: 8, location: "Seattle, WA" };
const oldBaseline = { roles: ["Old Designer"], yearsOfExperience: 3 };
const newBaseline = { roles: ["Senior Product Designer", "Senior UX Designer"], yearsOfExperience: 8 };

// A pending replacement ("new") over an active resume ("old"), one scoreable job so a started run
// really tries a model call (and, with no API key, fails before any network).
function seedPendingReplacement() {
  writeData("resumes.json", {
    currentVersion: "old",
    versions: {
      old: { version: "old", fileName: "old.pdf", storedAs: null, text: "old text", extraction: { fields: oldExtraction } },
      new: { version: "new", fileName: "new.pdf", storedAs: null, text: "new text", extraction: { fields: newExtraction } },
    },
    replacement: { state: "needs_confirmation", version: "new", fileName: "new.pdf" },
  });
  writeData("scores.json", { scores: {}, failures: {}, pending: null });
  writeData("jobs.json", {
    jobs: [{
      id: "greenhouse:acme:1", source: "greenhouse", company: { id: "c1", name: "Acme", domain: "acme.test" },
      title: "Product Designer", location: "United States", workMode: "remote", postedAt: NOW_ISO, firstSeenAt: NOW_ISO,
      applyUrl: "https://acme.test/1", descriptionText: "A role.", closed: false,
    }],
  });
  writeData("store.json", {
    watchlist: [{ id: "c1", name: "Acme", domain: "acme.test" }],
    companyMeta: { c1: { scrapeStatus: "ok", atsPlatform: "greenhouse", atsSlug: "acme" } },
    userState: { savedJobIds: [], dismissedJobIds: [] },
    profile: {
      resumeVersion: "old", relocation: "no", roles: ["Product Designer"], yearsOfExperience: 3, resumeValues: oldBaseline,
      locations: [{ label: "Seattle, Washington", city: "Seattle", region: "Washington", country: "United States", countryCode: "US" }],
      workTypes: { remote: true, onsite: false, hybrid: true },
    },
  });
}

async function untilSettled() {
  for (let i = 0; i < 100; i++) {
    const { state } = getReplacementStatus();
    if (state !== "running") return state;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("the replacement never settled");
}

test("a failed replace leaves resumeValues, the profile's resume version and the active resume as they were; edits made in Confirm details are kept but never become the baseline", async () => {
  seedPendingReplacement();
  // The person edits the designation and years in Confirm details.
  confirmReplacement({ profilePatch: { roles: ["Lead Product Designer"], yearsOfExperience: 12 } });
  assert.equal(getReplacementStatus().state, "ready"); // confirm starts nothing
  startScoring(); // the "Score now" click
  assert.equal(await untilSettled(), "failed"); // no API key: the scoring call fails, nothing is switched

  const { profile } = readData("store.json");
  assert.equal(profile.resumeVersion, "old");
  assert.deepEqual(profile.resumeValues, oldBaseline);
  assert.deepEqual(profile.roles, ["Lead Product Designer"]); // the person's answers are saved
  assert.equal(profile.yearsOfExperience, 12);
  assert.equal(readData("resumes.json").currentVersion, "old");

  // A retry that works: the baseline becomes what the NEW resume gave, not what was typed.
  activateReplacement("new");
  const after = readData("store.json").profile;
  assert.equal(after.resumeVersion, "new");
  assert.deepEqual(after.resumeValues, newBaseline);
  assert.deepEqual(after.roles, ["Lead Product Designer"]); // so the Role page shows these as "Answered"
  assert.equal(after.yearsOfExperience, 12);
});

test("discarding a pending replacement does not touch the baseline", async () => {
  seedPendingReplacement();
  const { discardReplacement } = await import("./replaceResume.js");
  discardReplacement();
  const { profile } = readData("store.json");
  assert.equal(profile.resumeVersion, "old");
  assert.deepEqual(profile.resumeValues, oldBaseline);
});

test("PUT /api/profile: a stale resume version and baseline can't undo a Replace resume switch", async () => {
  // The switch happened: the server is on "new" with the new baseline.
  writeData("resumes.json", { currentVersion: "new", versions: { old: {}, new: {} }, replacement: { state: "done" } });
  writeData("store.json", { watchlist: [], companyMeta: {}, userState: {}, profile: { resumeVersion: "new", resumeValues: newBaseline, relocation: "no", roles: ["Lead Product Designer"] } });

  const app = express();
  app.use(express.json());
  app.use("/api", stateRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const put = async (body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/profile`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return (await res.json()).profile;
  };
  try {
    // A page loaded before the switch writes its in-memory profile through.
    const stale = await put({ resumeVersion: "old", resumeValues: oldBaseline, relocation: "yes", roles: ["Typed Later"] });
    assert.equal(stale.resumeVersion, "new");
    assert.deepEqual(stale.resumeValues, newBaseline);
    assert.equal(stale.relocation, "yes"); // everything else is saved as sent
    assert.deepEqual(stale.roles, ["Typed Later"]);
    assert.deepEqual(readData("store.json").profile.resumeValues, newBaseline);

    // A current page writes its own values as before.
    const current = await put({ resumeVersion: "new", resumeValues: { roles: ["X"], yearsOfExperience: 1 }, relocation: "yes", roles: ["X"] });
    assert.deepEqual(current.resumeValues, { roles: ["X"], yearsOfExperience: 1 });

    // Onboarding upload of a different resume: POST /api/resume made it active first, so it is saved as sent.
    writeData("resumes.json", { currentVersion: "third", versions: { third: {} }, replacement: null });
    const upload = await put({ resumeVersion: "third", resumeValues: { roles: ["Third"], yearsOfExperience: 5 }, roles: ["Third"] });
    assert.equal(upload.resumeVersion, "third");
    assert.deepEqual(upload.resumeValues, { roles: ["Third"], yearsOfExperience: 5 });

    // First ever save (no stored profile): as sent.
    writeData("store.json", { watchlist: [], companyMeta: {}, userState: {}, profile: null });
    const first = await put({ resumeVersion: "third", resumeValues: { roles: [], yearsOfExperience: null }, roles: [] });
    assert.equal(first.resumeVersion, "third");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

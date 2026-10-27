// Run with: node --test server/ai/scoreNewResume.test.js
// "Score new resume": confirm no longer scores, scoring starts only from POST
// /api/resume/scoring/start, and the status and flags routes. The Anthropic client is replaced by
// a fake (setClientForTests), so the real scoring code runs with no network and no spend;
// ANTHROPIC_API_KEY is removed so anything that slipped past the fake would throw instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-score-new-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
const readData = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf-8"));

const { setClientForTests } = await import("./client.js");
const { confirmReplacement, startScoring, getScoringStatus } = await import("./replaceResume.js");
const { EXTRACTION_VERSION } = await import("./extractResume.js");
const { acquireRunLock, currentRunHolder } = await import("../store/runLock.js");
const { default: resumeRouter } = await import("../routes/resume.js");

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

// ─── The fake model ─────────────────────────────────────────────────────────────────────────────

// A scoring answer that passes every check in scoreJob.js.
const GOOD_ANSWER = JSON.stringify({
  factors: Object.fromEntries(
    ["requiredQualifications", "roleType", "levelFit", "domain", "niceToHaves", "companyStage"].map((k) => [
      k,
      { rating: 3, reason: "The resume and posting line up here." },
    ])
  ),
  knockout: null,
  reasoning: "Your product design work fits the focus of this role.",
  highlights: ["Design product flows."],
});

/** fail(jobId) → true makes that job's call throw like an API error. Records every call. */
function fakeClient({ fail = () => false } = {}) {
  const calls = [];
  const client = {
    messages: {
      async create(params) {
        const jobId = /Title: [^\n]*\n/.test(params.messages[0].content) ? params.messages[0].content.match(/<posting>\n(\S+)/)?.[1] : null;
        calls.push(jobId);
        if (fail(jobId)) throw new Error("529 Overloaded");
        return {
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [{ type: "text", text: GOOD_ANSWER }],
        };
      },
    },
  };
  setClientForTests(client);
  return calls;
}

// ─── Fixtures ───────────────────────────────────────────────────────────────────────────────────

const NOW_ISO = new Date().toISOString();
const JOB_IDS = ["greenhouse:acme:1", "greenhouse:acme:2"];
const job = (id) => ({
  id,
  source: "greenhouse",
  company: { id: "c1", name: "Acme", domain: "acme.test" },
  title: "Product Designer",
  location: "United States",
  workMode: "remote",
  postedAt: NOW_ISO,
  firstSeenAt: NOW_ISO,
  applyUrl: `https://acme.test/${id}`,
  // The fake reads the job id from the first word of the posting.
  descriptionText: `${id} Design product flows for the team.`,
  closed: false,
});
const oldScores = Object.fromEntries(JOB_IDS.map((id) => [id, { jobId: id, resumeVersion: "old", score: 61 }]));
const newFields = { designation: "Product Designer", adjacentRoles: [], yearsOfExperience: 5, location: "Seattle, WA" };

/** An active resume "old" and a new resume "new" in `state`, two eligible jobs scored for "old". */
function seed(state = "ready", extra = {}) {
  writeData("resumes.json", {
    currentVersion: "old",
    versions: {
      old: { version: "old", fileName: "old.pdf", storedAs: null, text: "old text", extraction: { fields: { ...newFields, designation: "Old" } } },
      new: { version: "new", fileName: "new.pdf", storedAs: null, text: "new resume text", extraction: { fields: newFields } },
    },
    replacement: state ? { state, version: "new", fileName: "new.pdf", ...extra } : null,
  });
  writeData("scores.json", { scores: oldScores, failures: {}, pending: null });
  writeData("jobs.json", { jobs: JOB_IDS.map(job) });
  writeData("store.json", {
    watchlist: [{ id: "c1", name: "Acme", domain: "acme.test" }],
    companyMeta: { c1: { scrapeStatus: "ok", atsPlatform: "greenhouse", atsSlug: "acme" } },
    userState: { savedJobIds: [], dismissedJobIds: [] },
    profile: {
      resumeVersion: "old",
      relocation: "no",
      roles: ["Product Designer"],
      yearsOfExperience: 5,
      resumeValues: { roles: ["Old"], yearsOfExperience: 5 },
      locations: [{ label: "Seattle, Washington", city: "Seattle", region: "Washington", country: "United States", countryCode: "US" }],
      workTypes: { remote: true, onsite: false, hybrid: true },
    },
  });
}

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

const post = (url, body) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
const put = (url) => fetch(url, { method: "PUT" });
const usageLog = () => {
  const file = path.join(dataDir, "ai-usage.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};

// ─── Tests ──────────────────────────────────────────────────────────────────────────────────────

test("confirm saves the edits and leaves the new resume ready: no scoring, no lock, scores untouched", async () => {
  seed("needs_confirmation");
  const calls = fakeClient();
  await withApp(async (base) => {
    const res = await post(`${base}/resume/replace/confirm`, { profilePatch: { yearsOfExperience: 7 } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { state: "ready", fileName: "new.pdf" });
    // Confirm again (the no-mismatch path): still ready, still nothing started.
    assert.equal((await post(`${base}/resume/replace/confirm`)).status, 200);
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls.length, 0);
  assert.equal(currentRunHolder(), null);
  assert.equal(getScoringStatus().state, "ready");
  assert.equal(readData("store.json").profile.yearsOfExperience, 7);
  assert.equal(readData("store.json").profile.resumeVersion, "old");
  assert.deepEqual(readData("scores.json"), { scores: oldScores, failures: {}, pending: null });
  assert.equal(readData("resumes.json").currentVersion, "old");
});

test("start route: 409 with nothing ready, while waiting for Confirm details, while running, and while another run holds the lock", async () => {
  const calls = fakeClient();
  await withApp(async (base) => {
    seed(null);
    let res = await post(`${base}/resume/scoring/start`);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "nothing_ready");

    seed("needs_confirmation");
    assert.equal((await post(`${base}/resume/scoring/start`)).status, 409);

    seed("done");
    assert.equal((await post(`${base}/resume/scoring/start`)).status, 409);

    // Running, held by a live process (this one).
    seed("running");
    const replaceLock = acquireRunLock("replace-resume");
    res = await post(`${base}/resume/scoring/start`);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "run_in_progress");
    replaceLock.release();

    // Ready, but a scrape holds the lock: refused, and the record stays ready.
    seed("ready");
    const scrapeLock = acquireRunLock("scrape");
    res = await post(`${base}/resume/scoring/start`);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "run_in_progress");
    scrapeLock.release();
    assert.equal(getScoringStatus().state, "ready");
  });
  assert.equal(calls.length, 0);
});

test("a failed run leaves the old resume and its scores alone, keeps new scores in pending; Try again reuses them; done promotes", async () => {
  seed("ready");
  // Job 2's call fails like an API outage; job 1's works.
  let calls = fakeClient({ fail: (id) => id === JOB_IDS[1] });
  const first = startScoring();
  assert.equal(first.state, "running");
  assert.equal(getScoringStatus().state, "running");
  await first.finished;

  let status = getScoringStatus();
  assert.equal(status.state, "failed");
  assert.equal(status.calls, 2);
  assert.ok(status.startedAt && status.finishedAt);
  assert.equal(calls.length, 2);
  // Nothing promoted: the old resume is active and its scores are what they were.
  assert.equal(readData("resumes.json").currentVersion, "old");
  assert.equal(readData("store.json").profile.resumeVersion, "old");
  const afterFail = readData("scores.json");
  assert.deepEqual(afterFail.scores, oldScores);
  assert.equal(afterFail.pending.resumeVersion, "new");
  assert.deepEqual(Object.keys(afterFail.pending.scores), [JOB_IDS[0]]); // the one that worked is kept
  assert.equal(currentRunHolder(), null); // lock released

  // Try again (the same start route): only the job not yet scored gets a call.
  calls = fakeClient();
  await withApp(async (base) => {
    const res = await post(`${base}/resume/scoring/start`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).state, "running");
    for (let i = 0; i < 100 && getScoringStatus().state === "running"; i++) await new Promise((r) => setTimeout(r, 20));
  });
  assert.deepEqual(calls, [JOB_IDS[1]]);

  status = getScoringStatus();
  assert.equal(status.state, "done");
  assert.equal(status.calls, 1);
  assert.equal(status.doneSeen, false);
  // Promoted exactly like the switch: new scores live, new resume active, pending cleared.
  const scores = readData("scores.json");
  assert.equal(scores.pending, null);
  assert.deepEqual(JOB_IDS.map((id) => scores.scores[id].resumeVersion), ["new", "new"]);
  assert.equal(readData("resumes.json").currentVersion, "new");
  assert.equal(readData("store.json").profile.resumeVersion, "new");
  assert.equal(readData("store.json").profile.relocation, "no"); // answers kept

  // Every run is in the usage log with start, finish and call count.
  const runs = usageLog().filter((e) => e.task === "replace-resume-scoring-run");
  assert.deepEqual(runs.map((r) => [r.outcome, r.calls]), [["failed", 2], ["done", 1]]);
  for (const r of runs) assert.ok(r.startedAt && r.finishedAt && r.durationMs >= 0);
});

test("modalSeen: set by its route, 409 with nothing to score, starts over when a new resume replaces the ready one", async () => {
  fakeClient();
  await withApp(async (base) => {
    seed(null);
    assert.equal((await put(`${base}/resume/scoring/modal-seen`)).status, 409);

    seed("ready");
    let status = await (await fetch(`${base}/resume/scoring`)).json();
    assert.equal(status.state, "ready");
    assert.equal(status.modalSeen, false);
    const res = await put(`${base}/resume/scoring/modal-seen`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).modalSeen, true);
    assert.equal(getScoringStatus().modalSeen, true);

    // Another file, already extracted (cached: no call), replaces the ready one: the flag resets.
    const buffer = Buffer.from("another resume file");
    const sha = createHash("sha256").update(buffer).digest("hex");
    const resumes = readData("resumes.json");
    resumes.versions[sha] = { version: sha, fileName: "another.pdf", text: "another text", extraction: { fields: newFields, extractionVersion: EXTRACTION_VERSION } };
    writeData("resumes.json", resumes);
    const upload = await fetch(`${base}/resume/replace`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": "another.pdf" },
      body: buffer,
    });
    assert.equal(upload.status, 200);
    assert.equal((await upload.json()).status, "ready");
    status = getScoringStatus();
    assert.equal(status.state, "ready");
    assert.equal(status.fileName, "another.pdf");
    assert.equal(status.modalSeen, false);
  });
});

test("doneSeen: 409 before a run finished, then set once and kept", async () => {
  fakeClient();
  await withApp(async (base) => {
    seed("ready");
    assert.equal((await put(`${base}/resume/scoring/done-seen`)).status, 409);
    seed("done", { doneSeen: false, startedAt: NOW_ISO, finishedAt: NOW_ISO, calls: 2 });
    let status = await (await fetch(`${base}/resume/scoring`)).json();
    assert.deepEqual([status.state, status.doneSeen, status.calls], ["done", false, 2]);
    assert.equal((await put(`${base}/resume/scoring/done-seen`)).status, 200);
    assert.equal((await put(`${base}/resume/scoring/done-seen`)).status, 200); // idempotent
    status = await (await fetch(`${base}/resume/scoring`)).json();
    assert.equal(status.doneSeen, true);
  });
});

test("Replace file is refused (409) while the new resume is being scored", async () => {
  const calls = fakeClient();
  seed("running");
  const lock = acquireRunLock("replace-resume"); // a live run
  try {
    await withApp(async (base) => {
      const res = await fetch(`${base}/resume/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-File-Name": "third.pdf" },
        body: Buffer.from("a third resume"),
      });
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error, "run_in_progress");
    });
  } finally {
    lock.release();
  }
  assert.equal(calls.length, 0);
  assert.equal(readData("resumes.json").replacement.version, "new");
});

test("status: none with no new resume or one waiting for Confirm details; never a call", async () => {
  const calls = fakeClient();
  seed(null);
  assert.equal(getScoringStatus().state, "none");
  seed("needs_confirmation");
  assert.equal(getScoringStatus().state, "none");
  assert.equal(calls.length, 0);
});

test("confirm is refused while the new resume is being scored", () => {
  seed("running");
  const lock = acquireRunLock("replace-resume");
  try {
    assert.throws(() => confirmReplacement({}), (err) => err.status === 409);
  } finally {
    lock.release();
  }
});

// ─── What the Resume tab row names and its download serves (the latest upload) ──────────────────

const { default: stateRouter } = await import("../routes/state.js");

/** The old (active) and new resumes, each with its own stored file, the new one in `state`. */
function seedWithFiles(state) {
  seed(state);
  const filesDir = path.join(dataDir, "resume-files");
  fs.mkdirSync(filesDir, { recursive: true });
  fs.writeFileSync(path.join(filesDir, "resume-old.pdf"), "OLD FILE BYTES");
  fs.writeFileSync(path.join(filesDir, "resume-new.pdf"), "NEW FILE BYTES");
  const resumes = readData("resumes.json");
  resumes.versions.old = { ...resumes.versions.old, fileName: "Old_Resume.pdf", storedAs: "resume-old.pdf" };
  resumes.versions.new = { ...resumes.versions.new, fileName: "Resume_updated.pdf", storedAs: "resume-new.pdf" };
  if (resumes.replacement) resumes.replacement.fileName = "Resume_updated.pdf";
  writeData("resumes.json", resumes);
}

async function withStateApp(fn) {
  const app = express();
  app.use(express.json());
  app.use("/api", stateRouter);
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

async function shown(base) {
  const { latestResume, activeResume } = await (await fetch(`${base}/state`)).json();
  const latest = await fetch(`${base}/resume/latest-file`);
  const active = await fetch(`${base}/resume/file`);
  return {
    row: latestResume?.fileName,
    hasFile: latestResume?.hasFile,
    latestIsNew: latestResume?.latestIsNew,
    activeRow: activeResume?.fileName,
    download: await latest.text(),
    downloadName: decodeURIComponent((latest.headers.get("content-disposition") ?? "").split("''")[1] ?? ""),
    activeDownload: await active.text(),
  };
}

test("Resume tab row and download: the latest upload while ready, running or failed; the active one for none, Confirm details and done", async () => {
  fakeClient();
  await withStateApp(async (base) => {
    const old = { row: "Old_Resume.pdf", hasFile: true, latestIsNew: false, download: "OLD FILE BYTES", downloadName: "Old_Resume.pdf" };
    const fresh = { row: "Resume_updated.pdf", hasFile: true, latestIsNew: true, download: "NEW FILE BYTES", downloadName: "Resume_updated.pdf" };
    const pick = (s) => ({ row: s.row, hasFile: s.hasFile, latestIsNew: s.latestIsNew, download: s.download, downloadName: s.downloadName });

    for (const [state, expected] of [[null, old], ["needs_confirmation", old], ["ready", fresh], ["failed", fresh]]) {
      seedWithFiles(state);
      const s = await shown(base);
      assert.deepEqual(pick(s), expected, `state ${state}`);
      // The active resume (scoring, tailoring, GET /api/resume/file) is still the old one.
      assert.equal(s.activeRow, "Old_Resume.pdf", `state ${state}`);
      assert.equal(s.activeDownload, "OLD FILE BYTES", `state ${state}`);
      assert.equal(readData("resumes.json").currentVersion, "old");
    }

    // running: needs a live run (the lock held), otherwise the record reads as interrupted.
    seedWithFiles("running");
    const lock = acquireRunLock("replace-resume");
    try {
      const s = await shown(base);
      assert.deepEqual(pick(s), fresh);
      assert.equal(s.activeDownload, "OLD FILE BYTES");
      assert.equal(getScoringStatus().state, "running");
    } finally {
      lock.release();
    }

    // done: the switch made the new resume active, so both name it.
    seedWithFiles("done");
    const resumes = readData("resumes.json");
    writeData("resumes.json", { ...resumes, currentVersion: "new", replacement: { state: "done", fileName: "Resume_updated.pdf", doneSeen: false } });
    const done = await shown(base);
    assert.deepEqual(pick(done), { ...fresh, latestIsNew: false });
    assert.equal(done.activeDownload, "NEW FILE BYTES");
  });
  // Serving the latest file never touched the old resume's file.
  assert.equal(fs.readFileSync(path.join(dataDir, "resume-files", "resume-old.pdf"), "utf-8"), "OLD FILE BYTES");
});

test("Replace file during a run is refused with 409 before anything else, even for the active resume's own file", async () => {
  const calls = fakeClient();
  seed("running");
  const activeBytes = Buffer.from("the active resume itself");
  const resumes = readData("resumes.json");
  const sha = createHash("sha256").update(activeBytes).digest("hex");
  resumes.versions[sha] = { version: sha, fileName: "active.pdf", storedAs: null, text: "active text" };
  writeData("resumes.json", { ...resumes, currentVersion: sha });
  const lock = acquireRunLock("replace-resume");
  try {
    await withApp(async (base) => {
      for (const [name, body] of [["active.pdf", activeBytes], ["notes.txt", Buffer.from("x")]]) {
        const res = await fetch(`${base}/resume/replace`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "X-File-Name": name },
          body,
        });
        assert.equal(res.status, 409, name);
        assert.equal((await res.json()).error, "run_in_progress");
      }
    });
  } finally {
    lock.release();
  }
  assert.equal(calls.length, 0);
  assert.equal(readData("resumes.json").versions[sha].storedAs, null); // nothing stored
  assert.equal(readData("resumes.json").replacement.state, "running");
});

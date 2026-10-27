// Run with: node --test server/ai/refreshScores.test.js
// Refresh after a Details edit: which edits matter, the "needs refresh" state coming from the
// server, and Refresh scoring only the jobs that are stale or newly eligible. The Anthropic client
// is replaced by a fake (setClientForTests), so the real scoring code runs with no network and no
// spend; ANTHROPIC_API_KEY is removed so anything that slipped past the fake would throw.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-refresh-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
const readData = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf-8"));

const { setClientForTests } = await import("./client.js");
const { SCORING_VERSION } = await import("./scoreJob.js");
const { scoreJobs } = await import("./runScoring.js");
const { activateReplacement } = await import("./replaceResume.js");
const { scoringFingerprint, profileEditAffectsScoring, getRefreshStatus, startRefresh, noteProfileEdit } = await import("./refreshScores.js");
const { acquireRunLock } = await import("../store/runLock.js");
const { default: stateRouter } = await import("../routes/state.js");
const { default: scoringRefreshRouter } = await import("../routes/scoringRefresh.js");

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

// ─── The fake model ─────────────────────────────────────────────────────────────────────────────

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

/** fail(jobId) → true makes that job's call throw like an API error. Records every scored job id. */
function fakeClient({ fail = () => false } = {}) {
  const calls = [];
  setClientForTests({
    messages: {
      async create(params) {
        const jobId = params.messages[0].content.match(/<posting>\n(\S+)/)?.[1] ?? null;
        calls.push(jobId);
        if (fail(jobId)) throw new Error("529 Overloaded");
        return { stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: "text", text: GOOD_ANSWER }] };
      },
    },
  });
  return calls;
}

// ─── Fixtures ───────────────────────────────────────────────────────────────────────────────────

const NOW_ISO = new Date().toISOString();
const job = (id, title = "Product Designer") => ({
  id,
  source: "greenhouse",
  company: { id: "c1", name: "Acme", domain: "acme.test" },
  title,
  location: "United States",
  workMode: "remote",
  postedAt: NOW_ISO,
  firstSeenAt: NOW_ISO,
  applyUrl: `https://acme.test/${id}`,
  descriptionText: `${id} Design product flows for the team.`, // the fake reads the job id from the first word
  closed: false,
});
const score = (jobId, years) => ({
  jobId,
  resumeVersion: "v1",
  scoringVersion: SCORING_VERSION,
  yearsOfExperience: years,
  score: 80,
  reasoning: "Your product design work fits.",
  highlights: [],
  scoredAt: NOW_ISO,
});
const profileBase = {
  resumeVersion: "v1",
  relocation: "no",
  roles: ["Product Designer"],
  yearsOfExperience: 5,
  locations: [{ label: "Seattle, Washington", city: "Seattle", region: "Washington", country: "United States", countryCode: "US" }],
  workTypes: { remote: true, onsite: false, hybrid: true },
  workAuth: "citizen",
  websites: { linkedin: "", portfolio: "", additional: [] },
};

// E1, E2 are eligible and scored for 5 years; E3 is eligible and never scored (newly eligible);
// N1 is not eligible (a title the profile doesn't match); R1 is a researcher, eligible only if the
// profile adds that role.
function seed({ profile = profileBase, replacement = null } = {}) {
  writeData("resumes.json", { currentVersion: "v1", versions: { v1: { version: "v1", fileName: "r.pdf", storedAs: null, text: "resume text", extraction: { fields: { yearsOfExperience: 5 } } } }, replacement });
  writeData("scores.json", { scores: { E1: score("E1", 5), E2: score("E2", 5) }, failures: {}, pending: null });
  writeData("jobs.json", { jobs: [job("E1"), job("E2"), job("E3"), job("N1", "Software Engineer"), job("R1", "UX Researcher")] });
  writeData("store.json", {
    watchlist: [{ id: "c1", name: "Acme", domain: "acme.test" }],
    companyMeta: { c1: { scrapeStatus: "ok", atsPlatform: "greenhouse", atsSlug: "acme" } },
    userState: { savedJobIds: [], dismissedJobIds: [] },
    profile,
  });
  fs.rmSync(path.join(dataDir, "ai-usage.jsonl"), { force: true });
}

async function withApp(fn) {
  const app = express();
  app.use(express.json());
  app.use("/api", stateRouter);
  app.use("/api", scoringRefreshRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const json = async (res) => ({ status: res.status, body: await res.json() });
  const api = {
    saveProfile: (patch, query = "?edit=details") =>
      fetch(`${base}/profile${query}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...readData("store.json").profile, ...patch }) }).then(json),
    status: () => fetch(`${base}/scoring/refresh`).then(json),
    start: () => fetch(`${base}/scoring/refresh/start`, { method: "POST" }).then(json),
  };
  try {
    await fn(api);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const usageLog = () => {
  const file = path.join(dataDir, "ai-usage.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const sorted = (a) => [...a].sort();
// Waits for the run the route started (the route itself doesn't wait).
const settle = async () => {
  for (let i = 0; i < 100; i++) {
    if ((await getRefreshStatus()).state !== "running") return;
    await new Promise((r) => setTimeout(r, 20));
  }
};

// ─── Which Details edits matter ─────────────────────────────────────────────────────────────────

test("years, roles, locations and relocation matter; work modes, work authorization, websites and spelling do not", () => {
  const edit = (patch) => profileEditAffectsScoring(profileBase, { ...profileBase, ...patch });
  assert.equal(edit({ yearsOfExperience: 6 }), true, "years are part of the cache key");
  assert.equal(edit({ roles: ["Product Designer", "UX Researcher"] }), true, "the title match");
  assert.equal(edit({ locations: [...profileBase.locations, { label: "Austin, Texas" }] }), true, "the location rule");
  assert.equal(edit({ relocation: "yes" }), true, "relocation widens the location rule");

  assert.equal(edit({ workTypes: { remote: false, onsite: true, hybrid: false } }), false, "only a ranking penalty");
  assert.equal(edit({ workAuth: "visa" }), false, "only the sponsorship flag");
  assert.equal(edit({ websites: { linkedin: "https://x.test", portfolio: "", additional: [] } }), false);
  assert.equal(edit({ roles: ["product designer "] }), false, "case and spacing are not a change");
  assert.equal(edit({ roles: [...profileBase.roles].reverse() }), false);
  assert.equal(scoringFingerprint(profileBase), scoringFingerprint({ ...profileBase }));
});

// ─── The state ──────────────────────────────────────────────────────────────────────────────────

test("a Details years edit leaves a stale state; it comes from the server, so a re-read still has it", async () => {
  seed();
  await withApp(async (api) => {
    assert.equal((await api.status()).body.state, "none");
    const saved = await api.saveProfile({ yearsOfExperience: 6 });
    assert.equal(saved.status, 200);
    assert.equal(readData("store.json").scoringRefresh.pending, true);
    // E1, E2 (scored for 5 years) are stale and E3 was never scored: three jobs need scoring.
    const first = (await api.status()).body;
    assert.deepEqual([first.state, first.needed], ["ready", 3]);
    // "A reload": nothing in this process remembers anything but the store.
    const again = (await api.status()).body;
    assert.deepEqual([again.state, again.needed], ["ready", 3]);
  });
});

test("an edit that changes nothing that matters shows no banner", async () => {
  seed();
  await withApp(async (api) => {
    await api.saveProfile({ websites: { linkedin: "https://x.test", portfolio: "", additional: [] }, workAuth: "visa", workTypes: { remote: false, onsite: true, hybrid: false } });
    assert.equal(readData("store.json").scoringRefresh, undefined, "nothing was marked");
    assert.equal((await api.status()).body.state, "none");
  });
});

test("an edit that matters but leaves nothing to score shows no banner, and the mark ends", async () => {
  // Everything eligible is already current (E3 scored too), then relocation changes.
  seed();
  writeData("scores.json", { scores: { E1: score("E1", 5), E2: score("E2", 5), E3: score("E3", 5) }, failures: {}, pending: null });
  await withApp(async (api) => {
    await api.saveProfile({ relocation: "yes" });
    assert.equal(readData("store.json").scoringRefresh.pending, true);
    assert.equal((await api.status()).body.state, "none");
    assert.equal(readData("store.json").scoringRefresh.pending, false, "cleared, so a later scrape can't revive it");
  });
});

test("the Role page's write-through (no ?edit=details) never marks anything", async () => {
  seed();
  await withApp(async (api) => {
    await api.saveProfile({ yearsOfExperience: 9 }, "");
    assert.equal(readData("store.json").scoringRefresh, undefined);
    assert.equal((await api.status()).body.state, "none");
  });
});

test("a Score new resume that is waiting, running or failed hides the refresh banner", async () => {
  for (const state of ["ready", "running", "failed"]) {
    seed({ replacement: { state, version: "v2", fileName: "n.pdf" } });
    noteProfileEdit(profileBase, { ...profileBase, yearsOfExperience: 7 });
    updateYears(7);
    assert.equal((await getRefreshStatus()).state, "none", state);
  }
  // Once the replacement no longer waits, the mark is back in force.
  seed();
  noteProfileEdit(profileBase, { ...profileBase, yearsOfExperience: 7 });
  updateYears(7);
  assert.equal((await getRefreshStatus()).state, "ready");
});

function updateYears(years) {
  const store = readData("store.json");
  writeData("store.json", { ...store, profile: { ...store.profile, yearsOfExperience: years } });
}

// ─── Refresh scores only what it should ─────────────────────────────────────────────────────────

test("Refresh after a years edit scores the stale jobs and the unscored one, nothing else", async () => {
  seed();
  const calls = fakeClient();
  await withApp(async (api) => {
    await api.saveProfile({ yearsOfExperience: 6 });
    const started = await api.start();
    assert.equal(started.status, 200);
    assert.equal(started.body.state, "running");
    await settle();

    assert.deepEqual(sorted(calls), ["E1", "E2", "E3"], "N1 is not eligible and R1 is not a role of the profile");
    const scores = readData("scores.json").scores;
    assert.equal(scores.E1.yearsOfExperience, 6);
    assert.equal(scores.N1, undefined);
    assert.equal(scores.R1, undefined);

    const after = (await api.status()).body;
    assert.equal(after.state, "none");
    assert.equal(readData("store.json").scoringRefresh.pending, false);
    const log = usageLog().filter((l) => l.task === "refresh-scoring-run");
    assert.equal(log.length, 1);
    assert.equal(log[0].outcome, "done");
    assert.equal(log[0].calls, 3);
  });
});

test("Refresh after adding a role scores only the newly eligible job, leaving current scores alone", async () => {
  seed();
  writeData("scores.json", { scores: { E1: score("E1", 5), E2: score("E2", 5), E3: score("E3", 5) }, failures: {}, pending: null });
  const calls = fakeClient();
  await withApp(async (api) => {
    await api.saveProfile({ roles: ["Product Designer", "UX Researcher"] });
    const status = (await api.status()).body;
    assert.deepEqual([status.state, status.needed], ["ready", 1]);
    await api.start();
    await settle();
    assert.deepEqual(calls, ["R1"], "E1, E2 and E3 are cached and never re-asked");
    assert.equal((await api.status()).body.state, "none");
  });
});

test("an API error fails the run at once (no retries inside it), and Try again finishes it", async () => {
  seed();
  const failing = fakeClient({ fail: () => true });
  await withApp(async (api) => {
    await api.saveProfile({ yearsOfExperience: 6 });
    await api.start();
    await settle();
    // The API error stops the run at the first failure (no automatic retry, no hammering).
    assert.ok(failing.length >= 1 && failing.length <= 3, `calls: ${failing.length}`);
    const failed = (await api.status()).body;
    assert.equal(failed.state, "failed");
    assert.match(failed.message, /Scoring stopped/);
    assert.equal(usageLog().find((l) => l.task === "refresh-scoring-run").outcome, "failed");

    const calls = fakeClient();
    assert.equal((await api.start()).status, 200, "Try again");
    await settle();
    assert.deepEqual(sorted(calls), ["E1", "E2", "E3"]);
    assert.equal((await api.status()).body.state, "none");
  });
});

test("a busy run lock means already running: 409, nothing is scored", async () => {
  seed();
  const calls = fakeClient();
  await withApp(async (api) => {
    await api.saveProfile({ yearsOfExperience: 6 });
    const lock = acquireRunLock("scrape");
    assert.equal(lock.ok, true);
    try {
      const res = await api.start();
      assert.equal(res.status, 409);
      assert.equal(res.body.error, "run_in_progress");
      assert.equal(calls.length, 0);
    } finally {
      lock.release();
    }
    assert.equal((await api.status()).body.state, "ready", "still waiting for a click");
  });
});

test("repeated clicks: a second start while one runs is a 409, and there is one run", async () => {
  seed();
  let release;
  const gate = new Promise((r) => { release = r; });
  const calls = [];
  setClientForTests({
    messages: {
      async create(params) {
        calls.push(params.messages[0].content.match(/<posting>\n(\S+)/)?.[1]);
        await gate;
        return { stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: "text", text: GOOD_ANSWER }] };
      },
    },
  });
  await withApp(async (api) => {
    await api.saveProfile({ yearsOfExperience: 6 });
    assert.equal((await api.start()).status, 200);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal((await api.status()).body.state, "running");
    assert.equal((await api.start()).status, 409);
    release();
    await settle();
    assert.equal(usageLog().filter((l) => l.task === "refresh-scoring-run").length, 1);
  });
  assert.ok(calls.length <= 3);
});

test("nothing to refresh is a 409 and starts nothing", async () => {
  seed();
  const calls = fakeClient();
  await withApp(async (api) => {
    const res = await api.start();
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "nothing_to_refresh");
    assert.equal(calls.length, 0);
  });
});

test("an edit made while a refresh runs stays waiting after it", async () => {
  seed();
  let release;
  const gate = new Promise((r) => { release = r; });
  setClientForTests({
    messages: {
      async create() {
        await gate;
        return { stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: "text", text: GOOD_ANSWER }] };
      },
    },
  });
  await withApp(async (api) => {
    await api.saveProfile({ yearsOfExperience: 6 });
    await api.start();
    await new Promise((r) => setTimeout(r, 30));
    await api.saveProfile({ yearsOfExperience: 7 }); // another edit, during the run
    release();
    await settle();
    assert.equal(readData("store.json").scoringRefresh.pending, true, "the second edit is not covered by this run");
  });
});

// ─── Score new resume and other runs ────────────────────────────────────────────────────────────

test("after Score new resume finishes, the refresh banner does not come back for an edit it covered", async () => {
  seed({ replacement: { state: "running", version: "v1", fileName: "r.pdf", startedAt: new Date(Date.now() + 1000).toISOString() } });
  noteProfileEdit(profileBase, { ...profileBase, yearsOfExperience: 7 });
  const editedAt = readData("store.json").scoringRefresh.editedAt;
  // The switch for a run that started after the edit.
  activateReplacement("v1", { startedAt: new Date(new Date(editedAt).getTime() + 5).toISOString(), finishedAt: NOW_ISO, calls: 0 });
  assert.equal(readData("store.json").scoringRefresh.pending, false);

  // An edit made after the run started stays waiting.
  seed({ replacement: { state: "running", version: "v1", fileName: "r.pdf" } });
  noteProfileEdit(profileBase, { ...profileBase, yearsOfExperience: 7 });
  const later = readData("store.json").scoringRefresh.editedAt;
  activateReplacement("v1", { startedAt: new Date(new Date(later).getTime() - 5000).toISOString(), finishedAt: NOW_ISO, calls: 0 });
  assert.equal(readData("store.json").scoringRefresh.pending, true);
});

test("any scoring run that leaves nothing unscored ends the mark (the daily run, score:jobs)", async () => {
  seed();
  noteProfileEdit(profileBase, { ...profileBase, yearsOfExperience: 6 });
  updateYears(6);
  assert.equal(readData("store.json").scoringRefresh.pending, true);
  fakeClient();
  const report = await scoreJobs({ abortOnApiError: true });
  assert.equal(report.status, "ok");
  assert.equal(readData("store.json").scoringRefresh.pending, false);
  assert.equal((await getRefreshStatus()).state, "none");
});

test("startRefresh refuses with a RefreshError when there is nothing waiting", async () => {
  seed();
  await assert.rejects(startRefresh(), (err) => err.status === 409 && err.code === "nothing_to_refresh");
});

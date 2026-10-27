// Run with: node --test server/pdf/pdf.test.js
// No real browser is launched and no network or model call is made: browser detection runs against a
// fake file system, and the routes are only hit with requests that fail before any generation.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-pdf-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));

const { findBrowser, candidatePaths, BROWSER_REQUIRED_MESSAGE } = await import("./browser.js");
const { buildFileName, isAllowedOrigin, loadDocument, listDocuments } = await import("./documents.js");
const { generatePdf, PdfError } = await import("./generate.js");
const { default: pdfRouter } = await import("../routes/pdf.js");
const { TAILORING_VERSION } = await import("../ai/tailorResume.js");

// ─── Browser detection ──────────────────────────────────────────────────────────────────────────

const only = (...paths) => (p) => paths.includes(p);

test("CHROME_PATH wins when it exists", () => {
  const chosen = findBrowser({ env: { CHROME_PATH: "/custom/chrome" }, platform: "linux", exists: only("/custom/chrome", "/usr/bin/google-chrome") });
  assert.equal(chosen, "/custom/chrome");
});

test("a CHROME_PATH that doesn't exist falls back to the usual paths", () => {
  const chosen = findBrowser({ env: { CHROME_PATH: "/nope" }, platform: "linux", exists: only("/usr/bin/chromium") });
  assert.equal(chosen, "/usr/bin/chromium");
});

test("Windows: Chrome first, then Edge, from the program folders", () => {
  const env = { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" };
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const chrome = "C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
  assert.equal(findBrowser({ env, platform: "win32", exists: only(edge) }), edge);
  assert.equal(findBrowser({ env, platform: "win32", exists: only(edge, chrome) }), chrome);
  assert.ok(candidatePaths("win32", env).includes("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"));
});

test("macOS and Linux paths include Chrome, Edge and Chromium", () => {
  assert.equal(
    findBrowser({ env: {}, platform: "darwin", exists: only("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge") }),
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  );
  assert.equal(findBrowser({ env: {}, platform: "linux", exists: only("/usr/bin/microsoft-edge") }), "/usr/bin/microsoft-edge");
  assert.equal(findBrowser({ env: {}, platform: "linux", exists: only("/snap/bin/chromium") }), "/snap/bin/chromium");
});

test("no browser found: null, and generatePdf says so without launching anything", async () => {
  assert.equal(findBrowser({ env: {}, platform: "linux", exists: () => false }), null);
  await assert.rejects(
    () => generatePdf("http://localhost:5173/print/x/resume", { findBrowserFn: () => null }),
    (err) => err instanceof PdfError && err.message === BROWSER_REQUIRED_MESSAGE && err.status === 500
  );
  assert.equal(BROWSER_REQUIRED_MESSAGE, "Chrome or Edge is required to generate PDFs");
});

// ─── File names ─────────────────────────────────────────────────────────────────────────────────

test("file names: Name - Resume - Company.pdf and Name - Cover Letter - Company.pdf", () => {
  assert.equal(buildFileName("Jane Doe", "Resume", "Acme"), "Jane Doe - Resume - Acme.pdf");
  assert.equal(buildFileName("Jane Doe", "Cover Letter", "Acme"), "Jane Doe - Cover Letter - Acme.pdf");
});

test("file names: unsafe characters become spaces, missing parts are left out", () => {
  assert.equal(buildFileName("Jane/Doe", "Resume", 'A:B*"Co"?'), "Jane Doe - Resume - A B Co.pdf");
  assert.equal(buildFileName(null, "Resume", "Acme"), "Resume - Acme.pdf");
  assert.equal(buildFileName("Jane", "Resume", null), "Jane - Resume.pdf");
  assert.equal(buildFileName(null, "Resume", null), "Resume.pdf");
});

// ─── Origin allowlist ───────────────────────────────────────────────────────────────────────────

test("only localhost, 127.0.0.1 and [::1] origins are allowed", () => {
  for (const ok of ["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173", "https://localhost", "http://localhost"]) {
    assert.equal(isAllowedOrigin(ok), true, ok);
  }
  for (const bad of [
    "http://evil.com",
    "http://localhost.evil.com",
    "http://evil.com/localhost",
    "http://user:pw@localhost:5173",
    "http://localhost:5173/",
    "http://localhost:5173/path",
    "http://127.0.0.2:5173",
    "http://[::2]:5173",
    "ftp://localhost",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "localhost:5173",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(isAllowedOrigin(bad), false, String(bad));
  }
});

// ─── Documents and routes ───────────────────────────────────────────────────────────────────────

const JOB = "greenhouse:acme:1";
const job = { id: JOB, company: { id: "c1", name: "Acme", domain: "acme.test" }, title: "Product Designer", closed: true };
const draft = {
  jobId: JOB,
  resumeVersion: "v1",
  tailoringVersion: TAILORING_VERSION,
  job: { title: "Product Designer", company: "Acme" },
  blocks: [
    { kind: "header", name: "Jane Doe", headline: "Designer", contact: ["jane@example.com"] },
    { kind: "summary", section: "Summary", paragraphs: ["<b>x</b> & more"] },
  ],
};
const LETTER_KEY = `${JOB}|abc|none|4`;
const letter = {
  key: LETTER_KEY,
  jobId: JOB,
  job: { title: "Product Designer", company: "Acme" },
  header: { name: "Jane Doe", headline: null, contact: [] },
  greeting: "Dear Acme Hiring Team,",
  paragraphs: ["One."],
  signoff: { closing: "Sincerely,", name: "Jane Doe" },
};

function seed({ resume = true, cover = true, edit = null } = {}) {
  writeData("jobs.json", { schemaVersion: 1, jobs: [job] });
  writeData("resumes.json", { schemaVersion: 1, currentVersion: "v1", versions: { v1: { text: "BASE" } }, replacement: null });
  writeData("tailored.json", { schemaVersion: 1, drafts: resume ? { [`${JOB}|v1|${TAILORING_VERSION}`]: draft } : {} });
  writeData("cover-letters.json", { schemaVersion: 1, letters: cover ? { [LETTER_KEY]: letter } : {}, latestByJob: cover ? { [JOB]: LETTER_KEY } : {} });
  writeData("edited-documents.json", { schemaVersion: 1, edits: edit ? { [`${JOB}|resume|${JOB}|v1|${TAILORING_VERSION}`]: edit } : {} });
}

async function withApp(fn) {
  const app = express();
  app.use("/api", pdfRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (url) => {
    const res = await fetch(`${base}${url}`);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    await fn(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const enc = encodeURIComponent;

test("documents: Resume first, only the ones that exist, with distinct names; shown for a closed job too", () => {
  seed();
  assert.deepEqual(listDocuments(JOB), [
    { tab: "resume", label: "Resume", fileName: "Jane Doe - Resume - Acme.pdf" },
    { tab: "cover", label: "Cover Letter", fileName: "Jane Doe - Cover Letter - Acme.pdf" },
  ]);
  seed({ resume: false });
  assert.deepEqual(listDocuments(JOB).map((d) => d.tab), ["cover"]);
  seed({ cover: false });
  assert.deepEqual(listDocuments(JOB).map((d) => d.tab), ["resume"]);
  seed({ resume: false, cover: false });
  assert.deepEqual(listDocuments(JOB), []);
});

test("document html: the generated draft is built with escaping; a saved edit wins", () => {
  seed();
  const generated = loadDocument(JOB, "resume");
  assert.equal(generated.edited, false);
  assert.ok(generated.html.includes("&lt;b&gt;x&lt;/b&gt; &amp; more"));
  assert.equal(generated.html.includes("<b>x</b>"), false);
  assert.ok(loadDocument(JOB, "cover").html.includes("Dear Acme Hiring Team,"));

  seed({ edit: { html: "<p>my edit</p>", savedAt: new Date().toISOString() } });
  const edited = loadDocument(JOB, "resume");
  assert.equal(edited.edited, true);
  assert.equal(edited.html, "<p>my edit</p>");
  // The cover letter has no edit of its own here.
  assert.equal(loadDocument(JOB, "cover").edited, false);
});

test("document html: the generated header links the profile's websites and the email; a saved edit is never rewritten", async () => {
  const { updateState } = await import("../store/store.js");
  updateState((state) => ({ ...state, profile: { websites: { linkedin: "", portfolio: "janedoe.vercel.app", additional: [] } } }));
  const withLinks = { ...draft, blocks: [{ kind: "header", name: "Jane Doe", headline: "Designer", contact: ["jane@example.com · janedoe.vercel.app (note)"] }, draft.blocks[1]] };
  writeData("jobs.json", { schemaVersion: 1, jobs: [job] });
  seed();
  writeData("tailored.json", { schemaVersion: 1, drafts: { [`${JOB}|v1|${TAILORING_VERSION}`]: withLinks } });
  const rel = 'rel="noopener noreferrer"';
  const generated = loadDocument(JOB, "resume").html;
  assert.ok(generated.includes(`<a href="mailto:jane@example.com" ${rel}>jane@example.com</a> · <a href="https://janedoe.vercel.app" ${rel}>janedoe.vercel.app</a> (note)`));
  // The same websites, but the person already saved an edit: it is used exactly as saved, with no links added.
  const saved = "<h1>Jane Doe</h1><p class=\"resume-contact\">janedoe.vercel.app</p>";
  writeData("edited-documents.json", { schemaVersion: 1, edits: { [`${JOB}|resume|${JOB}|v1|${TAILORING_VERSION}`]: { html: saved, savedAt: new Date().toISOString() } } });
  const edited = loadDocument(JOB, "resume");
  assert.equal(edited.edited, true);
  assert.equal(edited.html, saved);
  updateState((state) => ({ ...state, profile: null }));
});

test("routes: 404 for an unknown job or a missing document, 400 for a bad tab or origin; nothing is generated", async () => {
  seed({ cover: false });
  await withApp(async (call) => {
    assert.equal((await call(`/jobs/nope/documents`)).status, 404);
    assert.deepEqual((await call(`/jobs/${enc(JOB)}/documents`)).body.documents.map((d) => d.tab), ["resume"]);

    assert.equal((await call(`/jobs/nope/document?tab=resume`)).status, 404);
    assert.equal((await call(`/jobs/${enc(JOB)}/document?tab=cover`)).status, 404);
    assert.equal((await call(`/jobs/${enc(JOB)}/document?tab=pdf`)).status, 400);
    const doc = await call(`/jobs/${enc(JOB)}/document?tab=resume`);
    assert.equal(doc.status, 200);
    assert.equal(doc.body.fileName, "Jane Doe - Resume - Acme.pdf");

    const origin = enc("http://localhost:5173");
    assert.equal((await call(`/jobs/${enc(JOB)}/pdf?tab=pdf&origin=${origin}`)).status, 400);
    assert.equal((await call(`/jobs/${enc(JOB)}/pdf?tab=resume`)).status, 400);
    assert.equal((await call(`/jobs/${enc(JOB)}/pdf?tab=resume&origin=${enc("http://evil.com")}`)).status, 400);
    assert.equal((await call(`/jobs/${enc(JOB)}/pdf?tab=resume&origin=${enc("http://localhost.evil.com:5173")}`)).status, 400);
    assert.equal((await call(`/jobs/nope/pdf?tab=resume&origin=${origin}`)).status, 404);
    assert.equal((await call(`/jobs/${enc(JOB)}/pdf?tab=cover&origin=${origin}`)).status, 404);
  });
});

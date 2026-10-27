// Run with: node --test server/routes/edited.test.js
// No network and no model calls: temp data folder, fixture jobs, drafts and letters.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-edited-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;
const writeData = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
const readData = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf-8"));

const { default: editedRouter } = await import("./edited.js");
const { sanitizeEditedHtml, ALLOWED_TAGS, MAX_EDITED_HTML_CHARS } = await import("../edited/sanitizeEdited.js");
const { editedHtmlToText } = await import("../edited/htmlToText.js");
const { targetKey, editKey, getEdited, getSavedEditedResume } = await import("../edited/editedDocuments.js");
const { resumeSource } = await import("../ai/runCoverLetter.js");
const { TAILORING_VERSION } = await import("../ai/tailorResume.js");

const JOB = "greenhouse:acme:1";
const job = { id: JOB, company: { id: "c1", name: "Acme", domain: "acme.test" }, title: "Product Designer", closed: false };
const draft = (resumeVersion) => ({
  jobId: JOB,
  resumeVersion,
  tailoringVersion: TAILORING_VERSION,
  blocks: [
    { kind: "header", name: "Jane Doe", headline: "Product Designer", contact: ["jane@example.com"] },
    { kind: "summary", section: "Summary", paragraphs: ["Designer."] },
  ],
});
const draftKey = (version) => `${JOB}|${version}|${TAILORING_VERSION}`;
const LETTER_KEY = `${JOB}|abc|none|4`;

function seed({ version = "v1", withDraft = true, withLetter = true } = {}) {
  fs.rmSync(path.join(dataDir, "edited-documents.json"), { force: true });
  writeData("jobs.json", { schemaVersion: 1, jobs: [job] });
  writeData("resumes.json", { schemaVersion: 1, currentVersion: version, versions: { v1: { text: "BASE RESUME TEXT" }, v2: { text: "NEW BASE" } }, replacement: null });
  writeData("tailored.json", { schemaVersion: 1, drafts: withDraft ? { [draftKey("v1")]: draft("v1") } : {} });
  writeData("cover-letters.json", {
    schemaVersion: 1,
    letters: withLetter ? { [LETTER_KEY]: { key: LETTER_KEY, jobId: JOB, resumeSource: "tailored" } } : {},
    latestByJob: withLetter ? { [JOB]: LETTER_KEY } : {},
  });
  writeData("writing-style.json", { schemaVersion: 1, tone: "", letter: null, updatedAt: null });
}

async function withApp(fn) {
  const app = express();
  app.use("/api", editedRouter);
  app.use(express.json());
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    await fn(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const enc = encodeURIComponent;
const get = (call, tab, id = JOB) => call("GET", `/jobs/${enc(id)}/edited?tab=${tab}`);
const put = (call, body, id = JOB) => call("PUT", `/jobs/${enc(id)}/edited`, body);
const HTML = "<h1>Jane Doe</h1><p class=\"resume-headline\">Product Designer</p><h2>Experience</h2><ul><li><p>Led design.</p></li></ul>";

// ─── Sanitizer ──────────────────────────────────────────────────────────────────────────────────

test("sanitizer keeps what the editor produces", () => {
  const html =
    '<h1 class="resume-x" style="text-align: center">Jane</h1>' +
    '<p style="line-height: 1.5"><span style="font-family: Merriweather, serif; font-size: 12pt; color: #aa0000">Hi <strong>there</strong> <em>x</em> <u>y</u></span><br></p>' +
    '<h3><span class="resume-title">Role</span><span class="resume-meta"> Place | 2020</span></h3>' +
    "<ul><li><p>One</p><ul><li><p>Nested</p></li></ul></li></ul>";
  // sanitize-html writes style declarations without spaces and self-closes br.
  const expected = html.replace("<br>", "<br />").replace(/: /g, ":").replace(/; /g, ";");
  assert.equal(sanitizeEditedHtml(html), expected);
});

test("sanitizer drops scripts, handlers, links, images, ids, foreign classes and other styles", () => {
  const dirty =
    '<p id="x" class="evil resume-ok" onclick="alert(1)" style="color: red; position: fixed; text-align: left; background: url(x)">Hello' +
    '<script>alert(1)</script><a href="javascript:alert(1)">link</a><img src="x" onerror="alert(1)"><iframe src="x"></iframe>' +
    '<span style="font-size: 12pt; color: expression(alert(1)); font-family: url(x)">s</span></p><div>div text</div><ol><li>o</li></ol>';
  const clean = sanitizeEditedHtml(dirty);
  // Unknown tags go and their text stays; an orphan li is harmless (the editor drops it on load).
  assert.equal(clean, '<p class="resume-ok" style="text-align:left">Hellolink<span style="font-size:12pt">s</span></p>div text<li>o</li>');
  for (const bad of ["script", "onclick", "onerror", "href", "<img", "iframe", "id=", "position", "url(", "expression", "evil", "<div", "<ol"]) {
    assert.equal(clean.includes(bad), false, bad);
  }
});

test("the tag allowlist is exactly the editor's schema", () => {
  // "a" is the editor's link mark (StarterKit's link, src/components/ResumeEditor/extensions.js).
  assert.deepEqual([...ALLOWED_TAGS].sort(), ["a", "b", "br", "em", "h1", "h2", "h3", "li", "p", "span", "strong", "u", "ul"]);
});

// ─── Links ──────────────────────────────────────────────────────────────────────────────────────

const REL = 'rel="noopener noreferrer"';
const anchor = (href, text = "x") => `<p><a href="${href}">${text}</a></p>`;

test("sanitizer keeps a valid link as href and rel only, whatever else it carried", () => {
  assert.equal(sanitizeEditedHtml(anchor("https://example.com/a?b=1&c=2", "site")), `<p><a href="https://example.com/a?b=1&amp;c=2" ${REL}>site</a></p>`);
  assert.equal(sanitizeEditedHtml(anchor("http://example.com")), `<p><a href="http://example.com" ${REL}>x</a></p>`);
  assert.equal(sanitizeEditedHtml(anchor("HTTPS://Example.com")), `<p><a href="HTTPS://Example.com" ${REL}>x</a></p>`);
  assert.equal(sanitizeEditedHtml(anchor("mailto:jane@example.com", "mail")), `<p><a href="mailto:jane@example.com" ${REL}>mail</a></p>`);
  const noisy =
    '<p><a href="https://example.com" target="_blank" rel="opener" class="resume-x evil" style="color: red" id="i" onclick="alert(1)" onmouseover="alert(2)" data-x="1" download>go</a></p>';
  assert.equal(sanitizeEditedHtml(noisy), `<p><a href="https://example.com" ${REL}>go</a></p>`);
  // Formatting inside a link survives.
  assert.equal(
    sanitizeEditedHtml('<p><a href="https://example.com"><strong>Bold</strong> <u>link</u></a></p>'),
    `<p><a href="https://example.com" ${REL}><strong>Bold</strong> <u>link</u></a></p>`
  );
});

test("sanitizer removes a link with an unsafe address and keeps its words", () => {
  const bad = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "JAVASCRIPT:alert(1)",
    "  javascript:alert(1)",
    "\tjavascript:alert(1)",
    "\njavascript:alert(1)",
    "\u0001javascript:alert(1)",
    "\u0000javascript:alert(1)",
    "java\tscript:alert(1)",
    "java&#x09;script:alert(1)",
    "&#x6A;avascript:alert(1)",
    " https://example.com",
    "https://exam ple.com",
    "https://example.com/\u0007",
    "data:text/html,<script>alert(1)</script>",
    "DATA:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "VbScript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "tel:+15551234567",
    "//evil.example.com",
    "/relative/path",
    "./relative",
    "../up",
    "relative.html",
    "#fragment",
    "?q=1",
    "https:///nohost",
    "mailto:",
    "",
    "https://" + "a".repeat(3000) + ".com",
  ];
  for (const href of bad) {
    assert.equal(sanitizeEditedHtml(`<p><a href="${href}">words</a></p>`), "<p>words</p>", JSON.stringify(href));
  }
  assert.equal(sanitizeEditedHtml("<p><a>no href</a></p>"), "<p>no href</p>");
  assert.equal(sanitizeEditedHtml('<p><a name="n">anchor</a></p>'), "<p>anchor</p>");
});

test("a handler or an odd attribute on an anchor never survives, even on a safe address", () => {
  const attrs = [
    'onclick="alert(1)"',
    'onmouseover="alert(1)"',
    "onfocus=alert(1) autofocus",
    'ONCLICK="alert(1)"',
    'style="background:url(javascript:alert(1))"',
    'formaction="javascript:alert(1)"',
    'ping="https://evil.example"',
    'referrerpolicy="unsafe-url"',
  ];
  for (const attr of attrs) {
    assert.equal(sanitizeEditedHtml(`<p><a ${attr} href="https://example.com">t</a></p>`), `<p><a href="https://example.com" ${REL}>t</a></p>`, attr);
  }
});

test("link text only: the visible words reach the cover letter's resume text, never the address or markup", () => {
  const html =
    "<h1>Jane Doe</h1>" +
    '<p class="resume-contact"><a href="https://portfolio.example.com">Portfolio</a> | <a href="mailto:jane@example.com">jane@example.com</a> | <a href="https://linkedin.com/in/jane">LinkedIn</a></p>' +
    '<h2>Experience</h2><ul><li><p>Built <a href="https://example.com/case-study">a case study</a>, shipped.</p></li></ul>';
  const text = editedHtmlToText(sanitizeEditedHtml(html));
  assert.equal(text, ["Jane Doe", "Portfolio | jane@example.com | LinkedIn", "", "EXPERIENCE", "- Built a case study, shipped."].join("\n"));
  for (const leak of ["http", "href", "mailto", "vercel", "linkedin.com", "noopener", "<", ">"]) {
    assert.equal(text.includes(leak), false, leak);
  }
  // A link in the middle of a word does not split it.
  assert.equal(editedHtmlToText('<p>Port<a href="https://example.com">folio</a></p>'), "Portfolio");
});

test("non-strings sanitize to nothing", () => {
  assert.equal(sanitizeEditedHtml(null), "");
  assert.equal(sanitizeEditedHtml(42), "");
});

// ─── Text derivation ────────────────────────────────────────────────────────────────────────────

test("text from sanitized HTML: lines, upper-case h2 sections, bullets, entities, nested list text", () => {
  const html =
    '<h1>Jane Doe</h1><p class="resume-headline">Product <strong>Designer</strong></p><p class="resume-contact">jane@example.com</p>' +
    "<h2>Experience</h2><h3><span class=\"resume-title\">Lead</span><span class=\"resume-meta\"> Acme | 2020</span></h3>" +
    "<ul><li><p>Led &amp; shipped</p><ul><li><p>nested</p></li></ul></li><li><p></p></li></ul>";
  assert.equal(
    editedHtmlToText(html),
    ["Jane Doe", "Product Designer", "jane@example.com", "", "EXPERIENCE", "Lead Acme | 2020", "- Led & shipped nested"].join("\n")
  );
  assert.equal(editedHtmlToText(""), "");
});

// ─── Routes ─────────────────────────────────────────────────────────────────────────────────────

test("GET: 400 bad tab, 404 unknown job, null before any save", async () => {
  seed();
  await withApp(async (call) => {
    assert.equal((await call("GET", `/jobs/${enc(JOB)}/edited`)).status, 400);
    assert.equal((await call("GET", `/jobs/${enc(JOB)}/edited?tab=pdf`)).status, 400);
    assert.equal((await get(call, "resume", "nope")).status, 404);
    assert.deepEqual((await get(call, "resume")).body, { edited: null });
    assert.deepEqual((await get(call, "cover")).body, { edited: null });
  });
});

test("PUT: 400 for a bad tab, a non-string or empty html, too long; 404 unknown job; 409 nothing to attach to", async () => {
  seed();
  await withApp(async (call) => {
    assert.equal((await put(call, { tab: "pdf", html: HTML })).status, 400);
    assert.equal((await put(call, { html: HTML })).status, 400);
    assert.equal((await put(call, { tab: "resume", html: 5 })).status, 400);
    assert.equal((await put(call, { tab: "resume" })).status, 400);
    assert.equal((await put(call, { tab: "resume", html: "<script>x</script>" })).status, 400);
    assert.equal((await put(call, { tab: "resume", html: "   " })).status, 400);
    assert.equal((await put(call, { tab: "resume", html: "<p>" + "a".repeat(MAX_EDITED_HTML_CHARS) + "</p>" })).status, 400);
    assert.equal((await put(call, { tab: "resume", html: HTML }, "nope")).status, 404);
    assert.equal((await put(call, "not json")).status, 400);
    assert.equal(fs.existsSync(path.join(dataDir, "edited-documents.json")), false);
  });
  seed({ withDraft: false, withLetter: false });
  await withApp(async (call) => {
    assert.equal((await put(call, { tab: "resume", html: HTML })).status, 409);
    assert.equal((await put(call, { tab: "cover", html: HTML })).status, 409);
  });
});

test("PUT saves the sanitized html, overwrites, and leaves the draft and letter alone", async () => {
  seed();
  const draftBefore = fs.readFileSync(path.join(dataDir, "tailored.json"), "utf-8");
  const letterBefore = fs.readFileSync(path.join(dataDir, "cover-letters.json"), "utf-8");
  await withApp(async (call) => {
    const first = await put(call, { tab: "resume", html: HTML + '<script>alert(1)</script><p onclick="x">tail</p>' });
    assert.equal(first.status, 200);
    assert.equal(first.body.edited.html, HTML + "<p>tail</p>");
    assert.ok(first.body.edited.savedAt);
    assert.deepEqual((await get(call, "resume")).body.edited.html, first.body.edited.html);
    assert.deepEqual((await get(call, "cover")).body, { edited: null });

    const second = await put(call, { tab: "resume", html: "<p>second</p>" });
    assert.equal((await get(call, "resume")).body.edited.html, "<p>second</p>");
    assert.equal(Object.keys(readData("edited-documents.json").edits).length, 1);
    assert.ok(second.body.edited.savedAt >= first.body.edited.savedAt);

    await put(call, { tab: "cover", html: "<p>letter</p>" });
    assert.equal(Object.keys(readData("edited-documents.json").edits).length, 2);
  });
  assert.equal(fs.readFileSync(path.join(dataDir, "tailored.json"), "utf-8"), draftBefore);
  assert.equal(fs.readFileSync(path.join(dataDir, "cover-letters.json"), "utf-8"), letterBefore);
});

test("a valid link survives save and reload, an unsafe one is dropped on save, and an old edit without links is unchanged", async () => {
  seed();
  const safe = '<h1>Jane</h1><p><a href="https://portfolio.example.com">Portfolio</a></p>';
  await withApp(async (call) => {
    const saved = await put(call, { tab: "resume", html: safe + '<p><a href="javascript:alert(1)" onclick="x">trap</a></p>' });
    assert.equal(saved.status, 200);
    const expected = `<h1>Jane</h1><p><a href="https://portfolio.example.com" ${REL}>Portfolio</a></p><p>trap</p>`;
    assert.equal(saved.body.edited.html, expected);
    // Reload: GET returns the stored copy, and so does the file on disk.
    assert.equal((await get(call, "resume")).body.edited.html, expected);
    assert.equal(getEdited(JOB, "resume").html, expected);
    // Saving what the page loaded back is stable.
    assert.equal((await put(call, { tab: "resume", html: expected })).body.edited.html, expected);
    // An edit saved before links existed is unchanged by the new sanitizer.
    assert.equal((await put(call, { tab: "cover", html: HTML })).body.edited.html, HTML);
  });
});

// ─── Keys ───────────────────────────────────────────────────────────────────────────────────────

test("key resolution: resume uses the current draft's key, cover the latest letter's key", () => {
  seed();
  assert.equal(targetKey(JOB, "resume"), draftKey("v1"));
  assert.equal(targetKey(JOB, "cover"), LETTER_KEY);
  assert.equal(targetKey(JOB, "other"), null);
  assert.equal(editKey(JOB, "resume", draftKey("v1")), `${JOB}|resume|${draftKey("v1")}`);
  seed({ withDraft: false, withLetter: false });
  assert.equal(targetKey(JOB, "resume"), null);
  assert.equal(targetKey(JOB, "cover"), null);
});

test("after Replace resume the saved edit stays with the old draft's key and a new draft starts clean", async () => {
  seed();
  await withApp(async (call) => {
    await put(call, { tab: "resume", html: "<h1>Old edit</h1>" });
  });
  const stored = readData("edited-documents.json");
  const oldKey = editKey(JOB, "resume", draftKey("v1"));
  assert.ok(stored.edits[oldKey]);

  // The new resume is switched in: no draft for v2 yet.
  writeData("resumes.json", { schemaVersion: 1, currentVersion: "v2", versions: { v1: { text: "BASE RESUME TEXT" }, v2: { text: "NEW BASE" } }, replacement: null });
  assert.equal(getEdited(JOB, "resume"), null);
  await withApp(async (call) => {
    assert.deepEqual((await get(call, "resume")).body, { edited: null });
    assert.equal((await put(call, { tab: "resume", html: "<p>x</p>" })).status, 409);
  });
  // A v2 draft, once generated, starts with no edit; the old one is still stored under its own key.
  const tailored = readData("tailored.json");
  tailored.drafts[draftKey("v2")] = draft("v2");
  writeData("tailored.json", tailored);
  assert.equal(getEdited(JOB, "resume"), null);
  assert.ok(readData("edited-documents.json").edits[oldKey]);
});

// ─── Cover letter source order ──────────────────────────────────────────────────────────────────

test("cover letter source: saved edited resume, else tailored draft, else base resume", async () => {
  seed();
  assert.equal(resumeSource(JOB).source, "tailored");

  await withApp(async (call) => {
    await put(call, { tab: "resume", html: HTML });
  });
  const edited = resumeSource(JOB);
  assert.equal(edited.source, "editor");
  assert.equal(edited.resumeText, ["Jane Doe", "Product Designer", "", "EXPERIENCE", "- Led design."].join("\n"));
  assert.equal(edited.header.name, "Jane Doe");
  assert.equal(getSavedEditedResume(JOB).text, edited.resumeText);

  // A saved edit of the cover letter tab is not a resume source.
  seed();
  await withApp(async (call) => {
    await put(call, { tab: "cover", html: "<p>letter</p>" });
  });
  assert.equal(resumeSource(JOB).source, "tailored");

  seed({ withDraft: false });
  assert.equal(resumeSource(JOB).source, "base");
});

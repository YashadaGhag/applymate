// DEV ONLY: `npm run verify:pdf-links` (needs the Vite dev server on 5173, i.e. `npm run dev`; the API
// is not used). Proves programmatically that links in an edited document come out of the real
// print page as clickable links in the PDF, instead of someone looking at the file:
//
//   1. Runs the SAME sanitizer a save goes through over a sample document (safe links of each kind
//      plus a javascript: one that must not survive).
//   2. Opens the app's real print page (/print/:jobId/resume) in headless Chrome or Edge through
//      puppeteer-core, with only the document request answered locally (a fake `GET
//      /api/jobs/:id/document` carrying that sanitized HTML), and prints it with the same page.pdf
//      options as server/pdf/generate.js.
//   3. Reads the PDF's annotations back with pdf.js (unpdf) and checks that every safe link is a
//      /Link annotation with the exact URL and a non-empty clickable rectangle that sits over its
//      words, and that no javascript: / other URL is in the file.
//
// No AI call, no network beyond localhost, nothing written to data/.
import { findBrowser } from "../pdf/browser.js";
import { sanitizeEditedHtml } from "../edited/sanitizeEdited.js";
import { draftToHtml } from "../../shared/resumeHtml.js";

const ORIGIN = process.argv[2] ?? "http://localhost:5173";
const JOB = "verify-links";

// The header is built the way a generated resume's is (draftToHtml), so this also proves the header
// linking (shared/headerLinks.js): the portfolio address and the email are linked, the bare "LinkedIn"
// label becomes the profile's LinkedIn address, and the phone number stays text.
const WEBSITES = { linkedin: "https://www.linkedin.com/in/jane-doe", portfolio: "portfolio.example.com", additional: [] };
const HEADER = [
  { kind: "header", name: "Jane Doe", headline: "Designer", contact: ["(425) 555-0100 · jane@example.com · portfolio.example.com (note) · LinkedIn"] },
];
const SAMPLE =
  draftToHtml(HEADER, { websites: WEBSITES }) +
  '<h2>Experience</h2><ul><li><p>Shipped a redesign, see the <a href="http://example.com/case-study?a=1&b=2">case study</a>.</p></li>' +
  '<li><p>A trap: <a href="javascript:alert(1)" onclick="alert(2)">do not link me</a>.</p></li></ul>';

const EXPECTED = [
  { url: "https://portfolio.example.com/", text: "portfolio.example.com" },
  { url: "https://www.linkedin.com/in/jane-doe", text: "linkedin.com/in/jane-doe" },
  { url: "mailto:jane@example.com", text: "jane@example.com" },
  { url: "http://example.com/case-study?a=1&b=2", text: "case study" },
];

const executablePath = findBrowser();
if (!executablePath) {
  console.error("Chrome or Edge is required.");
  process.exit(2);
}

const html = sanitizeEditedHtml(SAMPLE);
console.log("Sanitized html:\n  " + html + "\n");

const { default: puppeteer } = await import("puppeteer-core");
const { getDocumentProxy } = await import("unpdf");

const browser = await puppeteer.launch({ executablePath, headless: true });
let pdf;
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === `/api/jobs/${JOB}/document`) {
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ html, name: "Jane Doe", label: "Resume", fileName: "Jane Doe - Resume - Acme.pdf" }),
      });
    } else req.continue();
  });
  await page.goto(`${ORIGIN}/print/${JOB}/resume`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForFunction("window.__printReady === true || Boolean(window.__printError)", { timeout: 20_000 });
  const failure = await page.evaluate("window.__printError ?? null");
  if (failure) throw new Error(`print page error: ${failure}`);
  pdf = new Uint8Array(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
} finally {
  await browser.close();
}

const doc = await getDocumentProxy(pdf);
const found = [];
for (let n = 1; n <= doc.numPages; n++) {
  const pdfPage = await doc.getPage(n);
  const { view } = pdfPage; // [x0, y0, x1, y1]
  const text = (await pdfPage.getTextContent()).items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
  for (const a of await pdfPage.getAnnotations()) {
    if (a.subtype !== "Link") continue;
    const [x0, y0, x1, y1] = a.rect;
    const inside = text.filter((t) => t.x >= x0 - 1 && t.x <= x1 && t.y >= y0 - 2 && t.y <= y1).map((t) => t.str).join("").trim();
    found.push({ page: n, url: a.url ?? a.unsafeUrl ?? null, rect: a.rect.map((v) => Math.round(v)), textUnder: inside, onPage: x0 >= view[0] && x1 <= view[2] && y0 >= view[1] && y1 <= view[3] });
  }
}
console.log(`PDF: ${doc.numPages} page(s), ${found.length} link annotation(s):`);
for (const f of found) console.log(`  p${f.page} ${f.url}  rect ${JSON.stringify(f.rect)}  text under it: "${f.textUnder}"`);

const problems = [];
for (const want of EXPECTED) {
  const hit = found.find((f) => f.url === want.url);
  if (!hit) problems.push(`missing link annotation for ${want.url}`);
  else {
    const [x0, y0, x1, y1] = hit.rect;
    if (x1 - x0 < 5 || y1 - y0 < 5 || !hit.onPage) problems.push(`${want.url}: clickable area is empty or off the page`);
    if (!hit.textUnder.includes(want.text.replace(/\s+/g, "")) && !hit.textUnder.includes(want.text)) problems.push(`${want.url}: the area does not sit over "${want.text}" (found "${hit.textUnder}")`);
  }
}
if (found.length !== EXPECTED.length) problems.push(`expected ${EXPECTED.length} link annotations, found ${found.length}`);
if (found.some((f) => !/^(https?:|mailto:)/i.test(f.url ?? ""))) problems.push("a link with another scheme is in the PDF");

if (problems.length) {
  console.error("\nFAILED:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("\nOK: every safe link is a clickable /Link annotation with the exact URL over its words; the javascript: link is not in the PDF.");

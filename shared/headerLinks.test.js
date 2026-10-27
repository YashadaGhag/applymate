// Run with: node --test shared/headerLinks.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftToHtml, letterToHtml } from "./resumeHtml.js";
import { sanitizeEditedHtml } from "../server/edited/sanitizeEdited.js";
import { editedHtmlToText } from "../server/edited/htmlToText.js";

const WEBSITES = { linkedin: "https://www.linkedin.com/in/jane-doe/", portfolio: "janedoe.vercel.app", additional: ["https://blog.example.com/"] };
const REL = 'rel="noopener noreferrer"';
const header = (...contact) => [{ kind: "header", name: "Jane Doe", headline: "Designer", contact }];
// What the document ends up as after the same sanitizer a saved edit goes through.
const contactHtml = (contact, websites = WEBSITES) => sanitizeEditedHtml(draftToHtml(header(...contact), { websites })).match(/<p class="resume-contact">.*?<\/p>/g);
const a = (href, text) => `<a href="${href}" ${REL}>${text}</a>`;

test("a website that matches the profile becomes a link; the text is the address without scheme or trailing slash", () => {
  assert.deepEqual(contactHtml(["janedoe.vercel.app"]), [`<p class="resume-contact">${a("https://janedoe.vercel.app", "janedoe.vercel.app")}</p>`]);
  assert.deepEqual(contactHtml(["https://www.JaneDoe.vercel.app/"]), [`<p class="resume-contact">${a("https://janedoe.vercel.app", "www.JaneDoe.vercel.app")}</p>`]);
  assert.deepEqual(contactHtml(["linkedin.com/in/jane-doe"]), [`<p class="resume-contact">${a("https://www.linkedin.com/in/jane-doe/", "linkedin.com/in/jane-doe")}</p>`]);
  assert.deepEqual(contactHtml(["blog.example.com"]), [`<p class="resume-contact">${a("https://blog.example.com/", "blog.example.com")}</p>`]);
});

test("a website that is not in the profile stays text, and nothing is added that the header doesn't show", () => {
  assert.deepEqual(contactHtml(["other.example.org · linkedin.com/in/someone-else"]), ['<p class="resume-contact">other.example.org · linkedin.com/in/someone-else</p>']);
  // The profile has a portfolio and LinkedIn, the header shows neither: no link, no text added.
  assert.deepEqual(contactHtml(["Seattle, WA"]), ['<p class="resume-contact">Seattle, WA</p>']);
  assert.deepEqual(contactHtml(["janedoe.vercel.app"], {}), ['<p class="resume-contact">janedoe.vercel.app</p>']);
  assert.deepEqual(contactHtml(["janedoe.vercel.app"], null), ['<p class="resume-contact">janedoe.vercel.app</p>']);
});

test("a lone LinkedIn label becomes the stored address as the linked text; only for LinkedIn, only without an address already shown", () => {
  assert.deepEqual(contactHtml(["Seattle, WA · LinkedIn"]), [`<p class="resume-contact">Seattle, WA · ${a("https://www.linkedin.com/in/jane-doe/", "www.linkedin.com/in/jane-doe")}</p>`]);
  // No LinkedIn in the profile: the label stays.
  assert.deepEqual(contactHtml(["LinkedIn"], { portfolio: "janedoe.vercel.app" }), ['<p class="resume-contact">LinkedIn</p>']);
  // The header already shows a linkedin.com address: the word stays, the address is linked.
  assert.deepEqual(contactHtml(["LinkedIn: linkedin.com/in/jane-doe"]), [`<p class="resume-contact">LinkedIn: ${a("https://www.linkedin.com/in/jane-doe/", "linkedin.com/in/jane-doe")}</p>`]);
  // "Portfolio" is a label too, but it is left alone (only LinkedIn is replaced).
  assert.deepEqual(contactHtml(["Portfolio"]), ['<p class="resume-contact">Portfolio</p>']);
});

test("the email becomes a mailto link; the phone number and notes next to a link stay exactly as they are", () => {
  const line = "(425) 555-0100 · jane@example.com · janedoe.vercel.app (Password: x&y) · LinkedIn";
  assert.deepEqual(contactHtml([line]), [
    `<p class="resume-contact">(425) 555-0100 · ${a("mailto:jane@example.com", "jane@example.com")} · ${a("https://janedoe.vercel.app", "janedoe.vercel.app")} (Password: x&amp;y) · ${a("https://www.linkedin.com/in/jane-doe/", "www.linkedin.com/in/jane-doe")}</p>`,
  ]);
  // Visible text of the line, without the markup: only the LinkedIn label became the address.
  const text = editedHtmlToText(sanitizeEditedHtml(draftToHtml(header(line), { websites: WEBSITES })));
  assert.equal(text, ["Jane Doe", "Designer", "(425) 555-0100 · jane@example.com · janedoe.vercel.app (Password: x&y) · www.linkedin.com/in/jane-doe"].join("\n"));
  assert.equal(text.includes("tel:"), false);
});

test("text with markup characters stays escaped, and a trailing full stop is not part of the address", () => {
  assert.deepEqual(contactHtml(['<b>x</b> "q" janedoe.vercel.app.']), [`<p class="resume-contact">&lt;b&gt;x&lt;/b&gt; "q" ${a("https://janedoe.vercel.app", "janedoe.vercel.app")}.</p>`]);
});

test("a stored address that fails the URL rule is never linked", () => {
  assert.deepEqual(contactHtml(["bad.example.com"], { portfolio: "javascript:alert(1)", additional: ["bad.example.com/ x"] }), ['<p class="resume-contact">bad.example.com</p>']);
});

test("the cover letter header is linked the same way; its other blocks are untouched", () => {
  const html = sanitizeEditedHtml(
    letterToHtml(
      [
        { kind: "header", name: "Jane Doe", headline: null, contact: ["jane@example.com · janedoe.vercel.app"] },
        { kind: "greeting", text: "Dear Acme Hiring Team," },
        { kind: "paragraph", text: "See janedoe.vercel.app for work." },
      ],
      { websites: WEBSITES }
    )
  );
  assert.ok(html.includes(a("mailto:jane@example.com", "jane@example.com")));
  assert.ok(html.includes(a("https://janedoe.vercel.app", "janedoe.vercel.app")));
  assert.ok(html.includes('<p class="resume-body">See janedoe.vercel.app for work.</p>'));
});

test("without options the document is as before, apart from the email link", () => {
  assert.equal(draftToHtml(header("Seattle, WA")), '<h1>Jane Doe</h1><p class="resume-headline">Designer</p><p class="resume-contact">Seattle, WA</p>');
});

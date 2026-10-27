// Turns a tailored draft's blocks (server/ai/tailorResume.js) into the resume document's HTML.
// The same HTML is shown read-only on mobile, loaded into the editor on desktop (which keeps the
// resume-* classes and the meta span, see src/components/ResumeEditor) and printed for the PDF, so
// it stays a flat run of plain elements (h1, p, h2, h3, ul/li, strong) with a few classes:
//   h1                      name
//   p.resume-headline       the resume's headline line
//   p.resume-contact        contact lines
//   h2                      section heading ("Summary", "Experience"…)
//   h3 > span.resume-title + span.resume-meta
//                           entry line: "Organization - Title", then location and dates on the right
//   ul > li                 bullets
//   p > strong              a skills group's label
// One column, standard headings, plain text: what an applicant tracking system reads best.
// Every piece of text is escaped; the draft never contributes markup of its own. The one exception
// is the header's contact lines, where websites the person saved in their profile and email addresses
// become links in code (headerLinks.js); pass them as `{ websites }`. A saved edit never comes here.

import { linkContactLines } from "./headerLinks.js";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function joinParts(parts, separator) {
  return parts.filter(Boolean).join(separator);
}

function entryLine(left, right) {
  // The meta starts with a real space so the line's text reads "Title Austin, TX | dates" when
  // copied or extracted from the PDF (a space between the two spans wouldn't render in the row).
  return `<h3><span class="resume-title">${esc(left)}</span>${right ? `<span class="resume-meta"> ${esc(right)}</span>` : ""}</h3>`;
}

function bullets(items) {
  return items?.length ? `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
}

/** A section heading, as draftToHtml writes it. */
export function sectionHeadingHtml(section) {
  return `<h2>${esc(section)}</h2>`;
}

/** One block's HTML without its section heading (the document shows these while tailoring runs). */
export function blockToHtml(block, { websites } = {}) {
  switch (block.kind) {
    case "header":
      return [
        `<h1>${esc(block.name)}</h1>`,
        block.headline ? `<p class="resume-headline">${esc(block.headline)}</p>` : "",
        ...linkContactLines(block.contact, websites, esc).map((html) => `<p class="resume-contact">${html}</p>`),
      ].join("");
    case "summary":
      return block.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("");
    case "role":
      return (
        entryLine(joinParts([block.organization, block.title], " - "), joinParts([block.location, block.dates], " | ")) +
        bullets(block.bullets)
      );
    case "education":
      return block.entries
        .map(
          (e) =>
            entryLine(e.degree, joinParts([joinParts([e.institution, e.location], ", "), e.dates], " | ")) +
            bullets(e.details)
        )
        .join("");
    case "skills":
      return block.groups
        .map((g) => `<p>${g.label ? `<strong>${esc(g.label)}:</strong> ` : ""}${esc(g.items.join(", "))}</p>`)
        .join("");
    default:
      return block.entries
        .map((e) => entryLine(joinParts([e.title, e.subtitle], " - "), e.dates) + bullets(e.bullets))
        .join("");
  }
}

/**
 * HTML for the blocks so far, in order. Missing indexes (a section still being written) are
 * skipped. A section heading is written once for consecutive blocks of the same section, so
 * several roles sit under one "Experience".
 */
export function draftToHtml(blocks, options) {
  let html = "";
  let lastSection = null;
  for (const block of blocks) {
    if (!block) continue;
    if (block.kind !== "header" && block.section !== lastSection) html += sectionHeadingHtml(block.section);
    lastSection = block.kind === "header" ? null : block.section;
    html += blockToHtml(block, options);
  }
  return html;
}

// ─── Cover letter ────────────────────────────────────────────────────────────
// Same document, same classes (so the editor, pagination and print all work unchanged): the header
// as on the resume, then p.resume-greeting, p.resume-body per paragraph, p.resume-closing and
// p.resume-signature. Every piece of text is escaped.

/** One cover letter block's HTML (header, greeting, paragraph or sign-off). */
export function letterBlockToHtml(block, { websites } = {}) {
  switch (block.kind) {
    case "header":
      return [
        block.name ? `<h1>${esc(block.name)}</h1>` : "",
        block.headline ? `<p class="resume-headline">${esc(block.headline)}</p>` : "",
        ...linkContactLines(block.contact, websites, esc).map((html) => `<p class="resume-contact">${html}</p>`),
      ].join("");
    case "greeting":
      return `<p class="resume-greeting">${esc(block.text)}</p>`;
    case "signoff":
      return `<p class="resume-closing">${esc(block.closing)}</p>${block.name ? `<p class="resume-signature">${esc(block.name)}</p>` : ""}`;
    default:
      return `<p class="resume-body">${esc(block.text)}</p>`;
  }
}

/** HTML for a cover letter's blocks, in order; missing indexes are skipped. */
export function letterToHtml(blocks, options) {
  return blocks.filter(Boolean).map((block) => letterBlockToHtml(block, options)).join("");
}

// Styles for this HTML, per the Figma "Resume · Ready to review" document: the same classes style
// the read-only view, the editor and the printed PDF. Descendant selectors keep the HTML plain.
// Sizes in print terms: body 10pt (text-document-body), name 20pt (text-document-name), keeping
// Figma's 2:1 name-to-body ratio; section and entry headings are body-sized, as in Figma.
// The base font is Inter (font-document); the editor's own font, size, color, line spacing and
// alignment choices are inline styles on top of these.
//
// Entry heading rows (h3: span.resume-title, then span.resume-meta, always exactly two pieces):
// below md, two equal columns, each wrapping in its own half; from md and in print, a flex row with
// the title taking the room and the meta hugging its text on the right. No floats: Chrome writes
// floated text to a PDF's text layer ahead of everything else, which would detach the dates from
// their roles for an applicant tracking system. The HTML order (title, then meta) is the reading
// order everywhere. The meta's leading space is kept (pre-wrap) so the text has a real word break
// between the two: a whitespace-only gap between flex or grid items isn't rendered, copied or printed.
export const RESUME_DOCUMENT_CLASSES =
  "font-document text-document-body font-regular text-neutral-700 " +
  "[&_h1]:text-document-name [&_h1]:font-semibold [&_h1]:text-neutral-800 [&_h1]:mb-sp4 " +
  "[&_.resume-headline]:text-neutral-700 [&_.resume-headline]:mb-sp4 " +
  "[&_.resume-contact]:text-neutral-500 [&_.resume-contact]:mb-sp4 " +
  "[&_h2]:mt-sp16 [&_h2]:mb-sp8 [&_h2]:pb-sp4 [&_h2]:border-b [&_h2]:border-neutral-100 " +
  "[&_h2]:text-document-body [&_h2]:font-regular [&_h2]:text-neutral-800 [&_h2]:uppercase " +
  "[&_h3]:grid [&_h3]:grid-cols-2 [&_h3]:items-baseline [&_h3]:gap-sp16 " +
  "md:[&_h3]:flex md:[&_h3]:justify-between print:[&_h3]:flex print:[&_h3]:justify-between " +
  "[&_.resume-title]:min-w-0 md:[&_.resume-meta]:shrink-0 print:[&_.resume-meta]:shrink-0 " +
  "[&_h3]:mt-sp8 [&_h2+h3]:mt-0 [&_h3]:text-document-body [&_h3]:font-regular [&_h3]:text-neutral-700 " +
  "[&_.resume-meta]:text-right [&_.resume-meta]:text-neutral-500 [&_.resume-meta]:whitespace-pre-wrap " +
  "[&_ul]:list-disc [&_ul]:pl-sp16 [&_ul]:mt-sp4 [&_li]:mb-sp4 [&_li>p]:mb-0 " +
  "[&_p]:mb-sp8 [&_strong]:font-bold " +
  // Links (the toolbar's link control): underlined, in the link color, in the editor, the view and the PDF.
  "[&_a]:text-primary-500 [&_a]:underline " +
  // Cover letter: space around the greeting and between paragraphs, the sign-off set apart.
  "[&_.resume-greeting]:mt-sp24 [&_.resume-greeting]:mb-sp16 [&_.resume-body]:mb-sp16 " +
  "[&_.resume-closing]:mt-sp24 [&_.resume-closing]:mb-sp4";

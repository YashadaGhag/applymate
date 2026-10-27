import { Extension, Mark } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { isAllowedHref } from "../../../shared/linkUrl.js";
import { Pagination } from "./pagination";

// The resume HTML (shared/resumeHtml.js) marks a few elements with resume-* classes that the
// document styles rely on (p.resume-headline, p.resume-contact). ProseMirror drops unknown
// attributes, so paragraphs and headings keep a class attribute, limited to resume-* classes.
const ResumeClasses = Extension.create({
  name: "resumeClasses",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          class: {
            default: null,
            parseHTML: (el) =>
              (el.getAttribute("class") ?? "")
                .split(/\s+/)
                .filter((c) => c.startsWith("resume-"))
                .join(" ") || null,
            renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
          },
        },
      },
    ];
  },
});

// An entry line (h3) is two spans, title then location and dates, which the document styles lay
// out as a row (see RESUME_DOCUMENT_CLASSES). Both are outermost marks, so formatting inside them
// nests within the one span, and a character is never in both. Text typed at either end inherits
// the neighbouring span, so the line stays two pieces.
const ResumeTitle = Mark.create({
  name: "resumeTitle",
  priority: 1000,
  excludes: "resumeMeta",
  parseHTML() {
    return [{ tag: "span.resume-title" }];
  },
  renderHTML() {
    return ["span", { class: "resume-title" }, 0];
  },
});

const ResumeMeta = Mark.create({
  name: "resumeMeta",
  priority: 1000,
  excludes: "resumeTitle",
  parseHTML() {
    return [{ tag: "span.resume-meta" }];
  },
  renderHTML() {
    return ["span", { class: "resume-meta" }, 0];
  },
});

// Line spacing for whole paragraphs and headings (TipTap's LineHeight styles inline text, which
// can make lines taller but not shorter). null means the document's own line height.
export const LINE_SPACING_OPTIONS = ["Default", "1.0", "1.15", "1.5", "2.0"];

const LineSpacing = Extension.create({
  name: "lineSpacing",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineSpacing: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineSpacing ? { style: `line-height: ${attrs.lineSpacing}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineSpacing:
        (value) =>
        ({ commands }) => {
          const lineSpacing = value && value !== "Default" ? value : null;
          return ["paragraph", "heading"].map((type) => commands.updateAttributes(type, { lineSpacing })).some(Boolean);
        },
    };
  },
});

/**
 * Only headings, paragraphs and bullets (applicant tracking systems read these best): no code,
 * quotes, rules, numbered lists or strikethrough, and there's no image or table node, so pasted
 * ones are reduced to their text. Links are the one inline extra: https, http and mailto only
 * (shared/linkUrl.js, the rule the server's sanitizer applies too), href and nothing else. Undo/redo comes with StarterKit (Ctrl/Cmd+Z, Shift+Z, Y).
 */
export const resumeExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    orderedList: false,
    strike: false,
    link: {
      // The popover is the only way to add one: no auto-linking of typed or pasted URLs. Clicks
      // are handled by the page (a caret in edit mode, a new tab in the read-only view).
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      isAllowedUri: (url) => isAllowedHref(url),
      HTMLAttributes: { rel: "noopener noreferrer", target: null, class: null },
    },
    // No empty paragraph appended after the last block: it would print as a blank line.
    trailingNode: false,
  }),
  TextStyle,
  FontFamily,
  FontSize,
  Color,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  LineSpacing,
  ResumeClasses,
  ResumeTitle,
  ResumeMeta,
  // On-screen page breaks (decorations only; see pagination.js).
  Pagination,
];

/**
 * Pasted HTML keeps its text and basic structure (headings, paragraphs, bullets, bold, italic,
 * underline) but not its styling: inline styles and other sites' classes are dropped before
 * ProseMirror reads it. A copy from within the editor itself (data-pm-slice) is left as is.
 */
export function cleanPastedHtml(html) {
  if (html.includes("data-pm-slice")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of doc.body.querySelectorAll("*")) {
    el.removeAttribute("style");
    if (el.tagName === "A") {
      // A pasted link keeps its address only (no target, rel, class or tracking attributes).
      for (const name of el.getAttributeNames()) if (name !== "href") el.removeAttribute(name);
    }
    const keep = [...el.classList].filter((c) => c.startsWith("resume-"));
    if (keep.length) el.className = keep.join(" ");
    else el.removeAttribute("class");
  }
  return doc.body.innerHTML;
}

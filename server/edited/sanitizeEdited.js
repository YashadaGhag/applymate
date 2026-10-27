import sanitizeHtml from "sanitize-html";
import { isAllowedHref } from "../../shared/linkUrl.js";

// Rule 16: the HTML of an edited resume or cover letter is sanitized before it is stored, and only
// the sanitized copy is ever stored, served or read for text. The allowlist is what the editor
// (src/components/ResumeEditor/extensions.js) can produce, and nothing else:
//
//  nodes   paragraph p, heading h1 h2 h3, bulletList ul, listItem li (TipTap writes li > p, and
//          lists may nest), hardBreak br
//  marks   bold strong (b is read too), italic em (StarterKit; Ctrl+I, no toolbar button),
//          underline u, link a (href only; see below), textStyle span (FontFamily, FontSize, Color), resumeTitle and resumeMeta
//          (span.resume-title / span.resume-meta)
//  blocks  class: resume-* (ResumeClasses); style: text-align (TextAlign) and line-height
//          (LineSpacing) on p and h1 h2 h3
//  spans   style: font-family, font-size, color (the toolbar's font, size and color)
//
// Links: the anchor keeps its href and nothing else. The href must pass isAllowedHref (https, http
// or mailto, nothing before the scheme, no whitespace or control characters; shared/linkUrl.js,
// the rule the editor applies too). Output is always <a href="..." rel="noopener noreferrer">:
// target, class, style, handlers and every other attribute are dropped. An anchor whose href fails
// the test is removed and its words stay.
//
// No images, tables, ids, event handlers, scripts or any other attribute or style property.
export const ALLOWED_TAGS = ["h1", "h2", "h3", "p", "ul", "li", "strong", "b", "em", "u", "br", "span", "a"];

export const LINK_REL = "noopener noreferrer";

// sanitize-html cannot drop one particular anchor and keep its words (renaming a tag to one that is
// not allowed throws off its closing tags), so an unsafe anchor is first left without an href, and
// those bare anchors are unwrapped here. After sanitize-html the markup is canonical: tags are
// rewritten by it, and `<`, `>` and quotes inside text and attribute values are escaped, so this
// scan only ever sees real tags.
function unwrapBareAnchors(html) {
  const stack = [];
  return html.replace(/<(\/?)a(?:\s[^>]*)?>/g, (tag, closing) => {
    if (!closing) {
      const bare = tag === "<a>";
      stack.push(bare);
      return bare ? "" : tag;
    }
    return stack.pop() ? "" : tag;
  });
}

const BLOCKS = ["h1", "h2", "h3", "p"];
export const ALLOWED_ATTRIBUTES = {
  ...Object.fromEntries(BLOCKS.map((tag) => [tag, ["class", "style"]])),
  span: ["class", "style"],
  a: ["href", "rel"],
};

export const ALLOWED_CLASSES = {
  ...Object.fromEntries(BLOCKS.map((tag) => [tag, ["resume-*"]])),
  span: ["resume-title", "resume-meta"],
};

// Value patterns: nothing that can carry a url(), an expression or a second declaration.
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/i];
const BLOCK_STYLES = {
  "text-align": [/^(left|center|right|justify)$/],
  "line-height": [/^\d(\.\d{1,2})?$/],
};
const SPAN_STYLES = {
  "font-family": [/^[A-Za-z][A-Za-z0-9 ,'"-]{0,80}$/],
  "font-size": [/^\d{1,3}(\.\d+)?(pt|px)$/],
  color: COLOR,
};
export const ALLOWED_STYLES = {
  ...Object.fromEntries(BLOCKS.map((tag) => [tag, BLOCK_STYLES])),
  span: SPAN_STYLES,
};

/** The size cap on the HTML a save may send (characters; the route's body limit is about 256kb). */
export const MAX_EDITED_HTML_CHARS = 250_000;

/** Returns the sanitized HTML. Never throws on markup; non-strings give an empty string. */
export function sanitizeEditedHtml(html) {
  if (typeof html !== "string") return "";
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedClasses: ALLOWED_CLASSES,
    allowedStyles: ALLOWED_STYLES,
    // Disallowed tags are dropped but their text stays (a pasted link keeps its words); script and
    // style elements lose their content too (sanitize-html's default).
    disallowedTagsMode: "discard",
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) =>
        isAllowedHref(attribs.href)
          ? { tagName: "a", attribs: { href: attribs.href, rel: LINK_REL } }
          : { tagName: "a", attribs: {} },
    },
  });
  return unwrapBareAnchors(clean).trim();
}

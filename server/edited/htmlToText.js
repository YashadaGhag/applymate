// Plain text from SANITIZED edited HTML (sanitizeEdited.js), with no DOM, so the server can derive
// the cover letter's resume source itself instead of trusting text from the browser. Same shape as
// the server's formatBlocks: one line
// per block, a blank line and an upper-case heading per h2 section (so header parsing stops there),
// "- " per bullet. Nested list text is joined into its bullet.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

const tidy = (text) => text.replace(/\s+/g, " ").trim();
// Inline marks sit inside a word ("Hel<strong>lo</strong>"); every other tag is a boundary. A link
// (a) is an inline mark too: its address is an attribute and is never part of the text.
const INLINE = new Set(["span", "strong", "b", "em", "u", "a"]);
const TOKEN = /<(\/?)([a-z0-9]+)\b[^>]*>|([^<]+)/gi;

export function editedHtmlToText(html) {
  const lines = [];
  let depth = 0;
  let top = null;
  let buffer = "";
  let item = null;

  for (const [, closing, rawName, text] of String(html ?? "").matchAll(TOKEN)) {
    if (text !== undefined) {
      if (top === "ul") {
        if (item !== null) item += decode(text);
      } else if (depth > 0) {
        buffer += decode(text);
      }
      continue;
    }
    const name = rawName.toLowerCase();
    if (!INLINE.has(name) && name !== "br" && depth > 0) {
      if (top === "ul") {
        if (item !== null) item += " ";
      } else {
        buffer += " ";
      }
    }
    if (name === "br") {
      if (top === "ul") {
        if (item !== null) item += " ";
      } else if (depth > 0) {
        buffer += " ";
      }
      continue;
    }
    if (!closing) {
      depth += 1;
      if (depth === 1) {
        top = name;
        buffer = "";
      } else if (top === "ul" && depth === 2 && name === "li") {
        item = "";
      }
    } else {
      if (top === "ul" && depth === 2 && name === "li") {
        if (tidy(item ?? "")) lines.push(`- ${tidy(item)}`);
        item = null;
      }
      if (depth === 1) {
        if (top === "h2") {
          if (tidy(buffer)) lines.push("", tidy(buffer).toUpperCase());
        } else if (top !== "ul" && tidy(buffer)) {
          lines.push(tidy(buffer));
        }
        top = null;
      }
      depth = Math.max(0, depth - 1);
    }
  }
  return lines.join("\n").trim();
}

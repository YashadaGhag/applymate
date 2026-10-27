import sanitizeHtml from "sanitize-html";

// The only place a job board's raw HTML enters ApplyMate — sanitize once here,
// at write time, so the store, the API and the client never have to handle
// untrusted markup themselves. A small structural allowlist only: enough for
// headings/paragraphs/lists to render, nothing that carries styling, scripts
// or tracking (no img, no style/class attributes, no inline event handlers).
const ALLOWED_TAGS = [
  "p",
  "br",
  "div",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "a",
];

export function sanitizeDescriptionHtml(html) {
  if (!html) return "";

  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      }),
    },
    // Job boards pad their rich text with empty paragraphs for spacing —
    // real spacing comes from CSS on the client, so drop empty blocks.
    exclusiveFilter: (frame) => ["p", "div", "span"].includes(frame.tag) && !frame.text.trim(),
  });

  return clean.trim();
}

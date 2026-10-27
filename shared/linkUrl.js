// Links in the resume and cover letter editor. One rule for the browser (what the link popover will
// apply, what a click may open) and the server (what the sanitizer keeps), so they cannot drift:
// only https, http and mailto. Anything else (javascript:, data:, vbscript:, relative paths) is
// refused. Plain code, no dependencies, no DOM; the server imports this file too (shared/).

export const MAX_LINK_CHARS = 2048;

// Whitespace and control characters (C0, DEL, C1). Browsers strip some of them before reading a
// scheme ("\u0001javascript:" still runs), and a real address never holds one.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARS =/[\u0000- \u007f-\u009f]/;
const ALLOWED_START = /^(https?:\/\/|mailto:)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// "example.com:8080" reads as a scheme to HAS_SCHEME, but it is a host and a port.
const HOST_AND_PORT = /^[^:/?#\s]+:\d+(?:[/?#]|$)/;
const BARE_EMAIL = /^[^\s@/:?#]+@[^\s@/:?#]+\.[^\s@/:?#]+$/;
const LOOKS_LIKE_HOST = /^[^\s/?#:]+\.[^\s/?#]+|^localhost(?::\d+)?(?:[/?#]|$)/i;

const UNSUPPORTED = "Use a web address (https:// or http://) or an email address.";

/**
 * True only for an address that is already complete and safe to store or open: starts (at the very
 * first character) with https://, http:// or mailto:, has no whitespace or control characters,
 * parses, and is not absurdly long. This is the sanitizer's test, so it is strict on purpose.
 */
export function isAllowedHref(href) {
  if (typeof href !== "string" || href.length === 0 || href.length > MAX_LINK_CHARS) return false;
  if (UNSAFE_CHARS.test(href) || !ALLOWED_START.test(href)) return false;
  // After "https://" the host starts at once ("https:///x" is not an address).
  if (!/^mailto:/i.test(href) && !/^https?:\/\/[^/?#]/i.test(href)) return false;
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol === "mailto:") return url.pathname.length > 0;
  return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
}

/**
 * What a person typed in the link field -> `{ ok: true, href }` or `{ ok: false, error }`.
 * "portfolio.example.com" gets https://, a bare email address gets mailto:. A scheme other
 * than https, http or mailto, and any relative path, is an error and nothing is applied.
 */
export function normalizeLinkInput(input) {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) return { ok: false, error: "Enter a web address or an email address." };
  if (UNSAFE_CHARS.test(text)) return { ok: false, error: "A link can't contain spaces." };

  let href;
  if (ALLOWED_START.test(text)) href = text;
  else if (BARE_EMAIL.test(text)) href = `mailto:${text}`;
  else if (HAS_SCHEME.test(text) && !HOST_AND_PORT.test(text)) return { ok: false, error: UNSUPPORTED };
  else if (/^[/.#?\\]/.test(text)) return { ok: false, error: UNSUPPORTED };
  else if (LOOKS_LIKE_HOST.test(text)) href = `https://${text}`;
  else return { ok: false, error: "That doesn't look like a web address." };

  if (!isAllowedHref(href)) return { ok: false, error: "That doesn't look like a valid address." };
  return { ok: true, href };
}

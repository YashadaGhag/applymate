// Links in the generated header (resume and cover letter), made in code from text the header already
// shows. The model never sees or writes a URL: the header's contact lines are copied from the resume,
// and when the document's HTML is built (resumeHtml.js) the websites the person saved in their profile
// (Change Preferences > Details) are matched against that text:
//   - an address in a contact line that matches a stored website (scheme, "www." and a trailing slash
//     ignored) becomes a link to the stored address, its text kept as written minus the scheme and a
//     trailing slash ("portfolio.example.com");
//   - a lone "LinkedIn" label becomes the stored LinkedIn address as linked text, unless the header
//     already shows a linkedin.com address;
//   - an email address becomes a mailto link, its text unchanged;
//   - a phone number, and every other character (notes in brackets, separators), stays exactly as is.
// Nothing is added that the header doesn't show. Every href goes through isAllowedHref (the editor's
// and the sanitizer's rule), and the server sanitizes generated HTML before printing it. Plain code,
// no AI, no DOM; the server imports this file through resumeHtml.js. A saved edit never comes through
// here: its HTML is used as saved.

import { isAllowedHref } from "./linkUrl.js";

const EMAIL = "[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}";
const URL_LIKE = "(?:https?:\\/\\/)?(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}(?::\\d+)?(?:\\/[^\\s·|,;()<>]*)?";
const LABEL = "\\bLinkedIn\\b";
// Order matters: at one position an email wins over a web address, which wins over the label.
const TOKEN = new RegExp(`(${EMAIL})|(${URL_LIKE})|(${LABEL})`, "gi");
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/** "https://www.Example.com/a/" -> "example.com/a"-style comparison key; null if it isn't an address. */
function keyOf(text) {
  const m = /^(?:https?:\/\/)?(?:www\.)?([^\s/?#]+)([^\s]*)$/i.exec(String(text ?? "").trim());
  if (!m) return null;
  return `${m[1].toLowerCase()}${m[2].replace(/\/+$/, "")}`;
}

const withoutScheme = (text) => text.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

/** The stored websites that can be linked: { byKey: Map(key -> https href), linkedin: { href, text } | null }. */
function storedSites(websites) {
  const byKey = new Map();
  let linkedin = null;
  const { linkedin: li, portfolio, additional } = websites ?? {};
  for (const raw of [li, portfolio, ...(Array.isArray(additional) ? additional : [])]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const value = raw.trim();
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const key = keyOf(value);
    if (!key || !isAllowedHref(href)) continue;
    if (!byKey.has(key)) byKey.set(key, href);
    if (raw === li && !linkedin) linkedin = { href, text: withoutScheme(value) };
  }
  return { byKey, linkedin };
}

/**
 * One contact line as HTML: escaped text with links where the rules above apply. `esc` is the
 * caller's HTML escaper (resumeHtml.js), so all text is escaped the same way. `ctx` is built once per
 * header by linkContactLines.
 */
function linkLine(line, ctx, esc) {
  const anchor = (href, text) => (isAllowedHref(href) ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text));
  let out = "";
  let last = 0;
  for (const m of String(line ?? "").matchAll(TOKEN)) {
    const [whole, email, web] = m;
    let token = whole;
    let html = null;
    if (email) {
      html = anchor(`mailto:${email}`, email);
    } else if (web) {
      const trailing = TRAILING_PUNCTUATION.exec(web)?.[0] ?? "";
      token = trailing ? web.slice(0, -trailing.length) : web;
      const href = ctx.sites.byKey.get(keyOf(token));
      if (href) html = anchor(href, withoutScheme(token));
    } else if (ctx.sites.linkedin && !ctx.showsLinkedinAddress) {
      html = anchor(ctx.sites.linkedin.href, ctx.sites.linkedin.text);
    }
    if (html === null) continue;
    out += esc(line.slice(last, m.index)) + html;
    last = m.index + token.length;
  }
  return out + esc(String(line ?? "").slice(last));
}

/**
 * The header's contact lines as HTML strings (same order, same count). With no usable websites, or
 * no lines, each line is just escaped text.
 */
export function linkContactLines(lines, websites, esc) {
  const list = Array.isArray(lines) ? lines : [];
  const ctx = {
    sites: storedSites(websites),
    // A header that already shows a linkedin.com address keeps a separate "LinkedIn" word as it is.
    showsLinkedinAddress: list.some((l) => /linkedin\.com/i.test(String(l ?? ""))),
  };
  return list.map((line) => linkLine(line, ctx, esc));
}

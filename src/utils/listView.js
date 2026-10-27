// Where a list view was left, so Job Details (and Customize Application) can send the person back to
// exactly that place. The VIEW (tab, page, sort, search, filter) lives in the list's own URL query, so a
// reload or the browser's back button keeps it; this file holds the pure rules for that and a small
// sessionStorage record for what a URL can't hold: the scroll position and the company groups opened
// with "See all N jobs". Plain code, no React.

const LISTS = { "/jobs": "Job Recommendations", "/tracker": "Application Tracker", "/saved": "Saved Jobs" };
export const DEFAULT_RETURN = { to: "/jobs", label: "Job Recommendations" };

/**
 * Where "back" goes, from the list URL last left (path + query). Anything that isn't one of the three
 * lists (nothing stored, a direct link in a new tab, junk, another site's address) falls back to Job
 * Recommendations' default view, the Watchlist tab.
 */
export function resolveReturn(url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return DEFAULT_RETURN;
  const label = LISTS[url.split(/[?#]/)[0]];
  return label ? { to: url, label } : DEFAULT_RETURN;
}

/** The page to show: at least 1 and at most the last page that has anything on it. */
export function clampPage(page, totalItems, pageSize) {
  const last = Math.max(1, Math.ceil(Math.max(0, totalItems) / pageSize));
  return Math.min(Math.max(1, Number.isInteger(page) ? page : 1), last);
}

/** A page number from a query value; anything that isn't a whole number of 1 or more is page 1. */
export function parsePage(value) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** A query value that must be one of `allowed`, else `fallback`. */
export function parseChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/**
 * A copy of `params` with `patch` applied: a value equal to its default (or empty) is removed so the
 * URL stays short and the default view has a clean URL.
 */
export function withParams(params, patch, defaults = {}) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    const text = value == null ? "" : String(value);
    if (text === "" || text === String(defaults[key] ?? "")) next.delete(key);
    else next.set(key, text);
  }
  return next;
}

/** Scroll and open groups are restored when arriving by back/forward/reload (POP) or by a return link. */
export function shouldRestore(navigationType, state) {
  return navigationType === "POP" || Boolean(state?.restoreView);
}

// ─── The sessionStorage record ───────────────────────────────────────────────────────────────────
// { last: "<url of the list last shown>", views: { "<url>": { scrollY, expanded: [group keys] } } }.
// Every read and write is in try/catch: if storage is unavailable the lists just open at the top and
// "back" falls back to the default view.

const KEY = "applymate.listViews";
const MAX_VIEWS = 40;
const EMPTY = () => ({ last: null, views: {} });

function read() {
  try {
    const parsed = JSON.parse(globalThis.sessionStorage?.getItem(KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return EMPTY();
    return { last: typeof parsed.last === "string" ? parsed.last : null, views: parsed.views && typeof parsed.views === "object" ? parsed.views : {} };
  } catch {
    return EMPTY();
  }
}

function write(record) {
  try {
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify(record));
  } catch {
    // Storage full or blocked: nothing is remembered.
  }
}

/** The list URL last shown in this tab, or null. */
export const lastListUrl = () => read().last;

export function rememberList(url) {
  write({ ...read(), last: url });
}

/** What was left at `url`: `{ scrollY, expanded[] }`, or null. */
export function readView(url) {
  const view = read().views[url];
  if (!view || typeof view !== "object") return null;
  return { scrollY: Number.isFinite(view.scrollY) ? view.scrollY : 0, expanded: Array.isArray(view.expanded) ? view.expanded.filter((k) => typeof k === "string") : [] };
}

/** Merges `patch` into the record for `url` (oldest records are dropped past a small cap). */
export function patchView(url, patch) {
  const record = read();
  record.views[url] = { scrollY: 0, expanded: [], ...record.views[url], ...patch };
  const urls = Object.keys(record.views);
  for (const old of urls.slice(0, Math.max(0, urls.length - MAX_VIEWS))) delete record.views[old];
  write(record);
}

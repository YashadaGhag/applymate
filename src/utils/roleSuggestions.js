import { matchesWordStarts, typedTokens } from "../../shared/wordStartMatch.js";

// Designation suggestions on the Role page, in the Change Preferences designation dialog and in
// Confirm details. Pure pieces, so they are tested without a browser; the hook is useRoleSuggestions.

/** Server suggestions for the typed text ("" gives the top ones). Throws on a network error. */
export async function fetchRoleSuggestions(query, signal) {
  const res = await fetch(`/api/roles/suggestions?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`/api/roles/suggestions responded ${res.status}`);
  const data = await res.json();
  return (data.suggestions ?? []).map((s) => s.title).filter((t) => typeof t === "string");
}

/** A failed request is not an error for the person: no server suggestions, free text still works. */
export async function safeRoleSuggestions(query, fetcher = fetchRoleSuggestions) {
  try {
    return await fetcher(query);
  } catch (err) {
    console.warn("[roles] suggestions failed:", err);
    return [];
  }
}

/**
 * The dropdown list: roles extracted from the resume first, then the server's suggestions, with
 * duplicates removed (ignoring case) and anything already selected left out. With text typed, both
 * parts only keep titles that match it at the start of a word, so a stale server answer for an
 * earlier text can't show titles that no longer fit. Nothing typed: the resume roles, then the
 * server's top suggestions.
 */
export function mergeRoleSuggestions({ resumeRoles = [], server = [], selected = [], typed = "" }) {
  const tokens = typedTokens(typed);
  const taken = new Set(selected.map((s) => s.toLowerCase()));
  const out = [];
  for (const title of [...resumeRoles, ...server]) {
    const key = title.toLowerCase();
    if (taken.has(key)) continue;
    if (tokens.length > 0 && !matchesWordStarts(title, tokens)) continue;
    taken.add(key);
    out.push(title);
  }
  return out;
}

/**
 * Keeps only the newest request's answer: run(key, promise, apply) calls apply with the result only
 * if no later run() has started, so a slow response never overwrites a newer one.
 */
export function latestOnly() {
  let latest = 0;
  return (promise, apply) => {
    const mine = ++latest;
    return promise.then((result) => {
      if (mine === latest) apply(result);
    });
  };
}

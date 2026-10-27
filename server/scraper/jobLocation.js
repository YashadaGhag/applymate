import { findPlace, countryCodeForName, usStateForName, isForeignRegionName, normalize } from "../geo/cities.js";

// Reads a job board's free-text location ("Seattle, WA", "US-Remote", "Denver, CO - Hybrid;
// Toronto, Ontario - Remote", "US, Canada") into pieces the prefilter can judge one at a time.
// Plain code over the offline city list; no profile input, so results are cached per string.
//
// A piece is { text, mode, place, countryOnly }:
// - mode: "remote" | "hybrid" | "onsite" | null, from words in that piece only.
// - place: null (no place named, e.g. plain "Remote"), or
//   { kind: "us", coords } — a known US city,
//   { kind: "us-unspecified" } — the US (or a US state) without a city we can place,
//   { kind: "non-us" }, or { kind: "unknown" } (named something we can't place, e.g. "Europe").
// - countryOnly: the piece is just a country name ("US"), which the prefilter treats specially.

const MODE_PATTERNS = [
  // "Anywhere in the U.S." is how some boards say remote.
  ["remote", /\b(remote|anywhere)\b/i],
  ["hybrid", /\bhybrid\b/i],
  ["onsite", /\b(on-?site|in[- ]office|in[- ]person)\b/i],
];
const MODE_WORDS = /\b(remote|anywhere|hybrid|on-?site|in[- ]office|in[- ]person)\b/gi;
// Words that ride along with a mode and aren't part of a place name ("Remote-Friendly", "Remote Eligible").
const FILLER_WORDS = /\b(friendly|first|eligible|only|based|preferred|optional|flexible|worldwide|travel[- ]required)\b/gi;

// Two-letter country codes collide with state codes and ordinary words ("CA", "IN", "OR"), so a
// country is only recognized by its full name, plus the abbreviations people actually write.
const COUNTRY_ABBREVIATIONS = new Set(["us", "usa", "uk"]);
function countryOf(text) {
  const n = normalize(text);
  if (n.length <= 3 && !COUNTRY_ABBREVIATIONS.has(n)) return null;
  return countryCodeForName(n);
}

// Splits on ; | / and on "or"/"and" between locations, but never inside parentheses:
// "Canada - Remote (ON, AB, BC, or NS Only)" is one piece, not two.
function splitTopLevel(location) {
  const pieces = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < location.length; i++) {
    const ch = location[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0) {
      if (ch === ";" || ch === "|" || ch === "/" || ch === "\n" || ch === "•") {
        pieces.push(current);
        current = "";
        continue;
      }
      const word = location.slice(i).match(/^\s(or|and|&)\s/i);
      if (word) {
        pieces.push(current);
        current = "";
        i += word[0].length - 1;
        continue;
      }
    }
    current += ch;
  }
  pieces.push(current);
  return pieces.map((p) => p.trim()).filter(Boolean);
}

function placeParts(text) {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(MODE_WORDS, " ")
    .replace(FILLER_WORDS, " ")
    .split(/,|\s[-–—]+\s/)
    .map((p) => p.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "").trim())
    .filter((p) => /[a-z]/i.test(p));
}

function placeFromCity(hit) {
  if (!hit) return null;
  return hit.location.countryCode === "US" ? { kind: "us", coords: hit.coords } : { kind: "non-us" };
}

function placeFromCountry(code) {
  return code === "US" ? { kind: "us-unspecified" } : { kind: "non-us" };
}

// A two-letter state code only counts in place-name position, right after a city
// ("Seattle, WA"), never on its own or inside running text ("..., or NS Only").
function resolveParts(parts) {
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    const [only] = parts;
    const code = countryOf(only);
    if (code) return placeFromCountry(code);
    // A bare province name means the province, not a same-named US city ("Remote, Ontario").
    if (isForeignRegionName(only)) return { kind: "non-us" };
    const city = placeFromCity(findPlace(only));
    if (city) return city;
    if (normalize(only).length > 2 && usStateForName(only)) return { kind: "us-unspecified" };
    // A country at the end of a phrase: "in the Continental U.S.", "within the United States".
    const words = normalize(only).split(" ");
    for (let i = 1; i < words.length; i++) {
      const tailCode = countryOf(words.slice(i).join(" "));
      if (tailCode) return placeFromCountry(tailCode);
    }
    return { kind: "unknown" };
  }

  const [first, ...rest] = parts;
  const city = placeFromCity(findPlace(first, rest));
  if (city) return city;

  // No city matched: fall back to the most specific thing we can read, right to left.
  for (let i = parts.length - 1; i >= 0; i--) {
    const code = countryOf(parts[i]);
    if (code) return placeFromCountry(code);
  }
  if (rest.some((p) => usStateForName(p))) return { kind: "us-unspecified" };
  return { kind: "unknown" };
}

// "Remote (Eligible in Bulgaria)", "Remote (US)": a scope named only in parentheses.
function placeFromParens(text) {
  const inner = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).join(",");
  if (!inner) return null;
  const codes = inner
    .split(/,|\bor\b|\band\b|&|\bin\b|\//i)
    .map((c) => countryOf(c.replace(FILLER_WORDS, " ").trim()))
    .filter(Boolean);
  if (codes.includes("US")) return { kind: "us-unspecified" };
  if (codes.length) return { kind: "non-us" };
  return null;
}

function parsePiece(text) {
  const mode = MODE_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? null;
  const parts = placeParts(text);

  // "US, Canada": a list of countries, each its own piece.
  if (parts.length > 1 && parts.every((p) => countryOf(p))) {
    return parts.map((p) => ({ text: p, mode, place: placeFromCountry(countryOf(p)), countryOnly: !mode }));
  }

  const place = resolveParts(parts) ?? placeFromParens(text);
  const countryOnly = !mode && parts.length === 1 && Boolean(countryOf(parts[0]));
  return [{ text, mode, place, countryOnly }];
}

const cache = new Map();
export function parseJobLocation(location) {
  const key = location ?? "";
  if (!cache.has(key)) cache.set(key, splitTopLevel(key).flatMap(parsePiece));
  return cache.get(key);
}

/**
 * Profile-independent: is any part of this job in the US, US-remote, or unrestricted remote?
 * Decides which Others jobs are worth storing at scrape time.
 */
export function isUsOrUsRemote(job) {
  const pieces = parseJobLocation(job.location);
  if (pieces.length === 0) return job.workMode === "remote";
  return pieces.some((p) => {
    if (p.place?.kind === "us" || p.place?.kind === "us-unspecified") return true;
    return (p.mode ?? job.workMode) === "remote" && !p.place;
  });
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// City search and name resolution over the offline list in cities.json (built by
// buildCities.js). The list stays on the server; the browser only ever sees search results.
//
// A location is { label, city, region, country, countryCode }:
// - label: what the chip shows. US: "Seattle, WA". Elsewhere: "Gurugram, India", with the
//   region added when a country has two places of the same name.
// - countryCode: ISO 3166-1 alpha-2, or null for free text that couldn't be placed.
// Free text keeps whatever could be read from it and nulls the rest; nothing is guessed.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "cities.json");
const MAX_RESULTS = 8;

// V1 is US-focused, so a US city outranks a non-US city that matches the typed text equally
// well, unless the non-US one is far bigger. Also offsets a data mismatch: Census counts the
// city itself, Natural Earth the whole metro. "port" → Portland, OR (630k × 10) before
// Porto Alegre (3.6M metro); "lond" → London, UK (8.5M) still before London, KY (8k × 10).
const US_RANK_BOOST = 10;

// Locations are always real places; "remote" is a work mode (the Role page's Remote checkbox),
// not a location. Text that only says remote ("Remote", "Remote (US)", "US Remote") never
// resolves to a location. Mirrored in shared/location.js.
const REMOTE_ONLY_PATTERN =
  /^((fully\s+)?remote(\W*\(?(us|usa|u\.s\.?|united states|anywhere|worldwide)\)?)?|(us|usa|u\.s\.?|united states)\W*remote)$/i;
export function isRemoteOnlyText(text) {
  return REMOTE_ONLY_PATTERN.test((text ?? "").trim());
}

export function normalize(text) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let index = null;

function load() {
  if (index) return index;
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  const stateCodes = data.usStates;

  const nameCounts = new Map();
  for (const [city, , cc] of data.cities) {
    const key = `${normalize(city)}|${cc}`;
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const entries = data.cities.map(([city, region, countryCode, population, aliases = [], lat, lon]) => {
    const country = data.countries[countryCode] ?? countryCode;
    const regionCode = countryCode === "US" ? stateCodes[region] ?? null : null;
    let label;
    if (countryCode === "US") label = `${city}, ${regionCode ?? region}`;
    else if (region && nameCounts.get(`${normalize(city)}|${countryCode}`) > 1) label = `${city}, ${region}, ${country}`;
    else label = `${city}, ${country}`;

    return {
      location: { label, city, region, country, countryCode },
      population,
      names: [city, ...aliases].map(normalize),
      qualifiers: [region, regionCode, country, countryCode].filter(Boolean).map(normalize),
      // US rows only (Census Gazetteer); null elsewhere.
      coords: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
    };
  });

  // Exact-name lookup for the job prefilter, which resolves thousands of job locations per
  // request; the type-ahead search above still scans, since it matches prefixes.
  const byName = new Map();
  for (const entry of entries) {
    for (const name of entry.names) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(entry);
    }
  }

  // Words that name a country or US state, for reading free text like "Austin, TX".
  const countryByName = new Map();
  for (const [code, name] of Object.entries(data.countries)) {
    countryByName.set(normalize(name), code);
    countryByName.set(normalize(code), code);
  }
  for (const alias of ["usa", "united states of america", "america"]) countryByName.set(alias, "US");
  for (const alias of ["uk", "england", "scotland", "wales", "great britain"]) countryByName.set(alias, "GB");
  const stateByName = new Map();
  for (const [name, code] of Object.entries(stateCodes)) {
    stateByName.set(normalize(name), name);
    stateByName.set(normalize(code), name);
  }

  // Provinces and states outside the US ("Ontario", "British Columbia"), for the job prefilter.
  const foreignRegions = new Set(
    data.cities.filter(([, region, cc]) => cc !== "US" && region).map(([, region]) => normalize(region))
  );

  index = { entries, byName, foreignRegions, countries: data.countries, stateCodes, countryByName, stateByName };
  return index;
}

function nameScore(names, query, exactOnly) {
  let best = 0;
  for (const name of names) {
    if (name === query) return 3;
    if (exactOnly) continue;
    if (name.startsWith(query)) best = Math.max(best, 2);
    else if (` ${name}`.includes(` ${query}`)) best = Math.max(best, 1); // "york" finds "New York"
  }
  return best;
}

function qualifiersMatch(entry, quals, exactOnly) {
  return quals.every((q) => entry.qualifiers.some((w) => (exactOnly ? w === q : w.startsWith(q))));
}

function match(cityQuery, quals, { exactOnly = false } = {}) {
  const { entries } = load();
  const hits = [];
  for (const entry of entries) {
    const score = nameScore(entry.names, cityQuery, exactOnly);
    if (score && qualifiersMatch(entry, quals, exactOnly)) hits.push({ entry, score });
  }
  const rank = (entry) => entry.population * (entry.location.countryCode === "US" ? US_RANK_BOOST : 1);
  return hits.sort((a, b) => b.score - a.score || rank(b.entry) - rank(a.entry));
}

function splitQuery(text) {
  const parts = normalize(text).split(",").map((p) => p.trim()).filter(Boolean);
  return { city: parts[0] ?? "", quals: parts.slice(1) };
}

/**
 * Type-ahead search. "port" → Portland, OR first (largest), then others. A comma narrows by
 * region or country ("portland, me", "london, canada"); so does a trailing state or country
 * word without a comma ("portland or").
 */
export function searchCities(query) {
  const { city, quals } = splitQuery(query);
  if (city.length < 2) return [];
  let hits = match(city, quals);
  if (!hits.length && !quals.length && city.includes(" ")) {
    const words = city.split(" ");
    hits = match(words.slice(0, -1).join(" "), [words.at(-1)]);
  }
  return hits.slice(0, MAX_RESULTS).map((h) => h.entry.location);
}

/**
 * Turns a typed or extracted place name into a location. Uses the city list only when the
 * name identifies exactly one place ("Seattle", "Redmond, WA", "Gurugram"); an ambiguous name
 * ("Portland", "Redmond") is not resolved to the biggest match. Otherwise the text is read for a
 * trailing US state or country ("Pune, India", "Austin, TX") and anything unknown stays null.
 * Returns null for empty text and for remote-only text, which isn't a place.
 */
export function resolveLocation(text) {
  const raw = (text ?? "").trim();
  if (!raw || isRemoteOnlyText(raw)) return null;
  const { city, quals } = splitQuery(raw);
  const hits = match(city, quals, { exactOnly: true });
  if (hits.length === 1) return hits[0].entry.location;
  return parseLocationText(raw);
}

function parseLocationText(raw) {
  const { countries, countryByName, stateByName } = load();
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const free = { label: raw, city: parts[0] ?? raw, region: null, country: null, countryCode: null };
  if (parts.length < 2) return free;

  const last = normalize(parts.at(-1));
  const state = stateByName.get(last);
  // A two-part "City, XX" where XX is a state code is read as a US state ("Austin, TX"), even
  // though some codes are also countries ("IN", "CA"): that's how US addresses are written.
  if (state && (parts.length === 2 || countryByName.get(normalize(parts.at(-2))) === "US")) {
    return { ...free, region: state, country: countries.US, countryCode: "US" };
  }
  const code = countryByName.get(last);
  if (code) {
    const region = parts.length > 2 ? parts[1] : null;
    return { ...free, region, country: countries[code] ?? code, countryCode: code };
  }
  return free;
}

/** Accepts a stored location in either form (old plain string or object) and returns an object. */
export function toLocation(value) {
  if (value && typeof value === "object" && typeof value.label === "string") return value;
  if (typeof value === "string") return resolveLocation(value);
  return null;
}

/**
 * Exact place lookup for the job prefilter: a city name plus optional qualifiers (state name or
 * code, country name or code), each already split out of the text. Returns the best match as
 * { location, coords } (coords null outside the US), or null when nothing matches exactly.
 * Same ranking as search: a bare name goes to the biggest place, with US places boosted
 * ("Atlanta" → Atlanta, GA; "London" → London, UK).
 */
export function findPlace(city, qualifiers = []) {
  const { byName } = load();
  const quals = qualifiers.map(normalize).filter(Boolean);
  const rank = (e) => e.population * (e.location.countryCode === "US" ? US_RANK_BOOST : 1);
  const lookup = (name) =>
    (byName.get(name) ?? []).filter((e) => qualifiersMatch(e, quals, true)).sort((a, b) => rank(b) - rank(a))[0];
  const name = normalize(city);
  // "New York City" is listed as "New York".
  const hit = lookup(name) ?? (name.endsWith(" city") ? lookup(name.slice(0, -5)) : undefined);
  return hit ? { location: hit.location, coords: hit.coords } : null;
}

/** Coordinates for a stored profile location ({ city, region, countryCode }), or null. */
export function coordsForLocation(loc) {
  if (!loc?.city) return null;
  return findPlace(loc.city, [loc.region, loc.countryCode].filter(Boolean))?.coords ?? null;
}

/** Normalized country word → ISO code ("united states", "usa", "us", "canada", "uk"). */
export function countryCodeForName(text) {
  return load().countryByName.get(normalize(text)) ?? null;
}

/** Every country's English name ("Canada", "United Kingdom"). */
export function countryNames() {
  return Object.values(load().countries);
}

/** True for a province/state name outside the US ("Ontario"), unless it's also a US state name. */
export function isForeignRegionName(text) {
  const { foreignRegions, stateByName } = load();
  const n = normalize(text);
  return foreignRegions.has(n) && !stateByName.has(n);
}

/** Full US state name or two-letter code → state name, or null. */
export function usStateForName(text) {
  return load().stateByName.get(normalize(text)) ?? null;
}

/** Great-circle distance in miles. */
export function distanceMiles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

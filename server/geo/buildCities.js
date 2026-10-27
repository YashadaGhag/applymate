// Builds server/geo/cities.json, the offline city list behind GET /api/locations/search.
// Run with `npm run build:cities`. The output is committed, so the app and forks never need
// to run this; it's only here to regenerate or update the data.
//
// Sources (both public domain, no attribution required):
// - US: U.S. Census Bureau, "City and Town Population Totals" (sub-est2024.csv), incorporated
//   places and CDPs. A US government work, so not subject to copyright. Covers small US cities
//   (Redmond, Sunnyvale, Mountain View) that world datasets miss.
// - US coordinates: U.S. Census Bureau, 2024 Gazetteer Files, Places (one internal point per place).
//   Same publisher and terms. Joined on place ID (GEOID = state FIPS + place FIPS), so every
//   US row gets a lat/lon for the job prefilter's distance check. Non-US rows have none (V1 is US-only).
// - Everywhere else: Natural Earth 1:10m Populated Places, explicitly public domain
//   (https://www.naturalearthdata.com/about/terms-of-use/). About 6,500 non-US places: capitals,
//   regional capitals and larger cities. Smaller non-US towns are not covered; free text handles them.
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "cities.json");

const CENSUS_URL =
  "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv";
const GAZETTEER_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip";
const NATURAL_EARTH_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson";

// US places below this are left out to keep the file small; they can still be typed as free text.
const MIN_US_POPULATION = 1000;

export const US_STATES = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA",
  Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
  Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "Puerto Rico": "PR",
};

// Census names carry a legal suffix ("Redmond city") and consolidated governments have long
// names ("Nashville-Davidson metropolitan government (balance)").
const CENSUS_OVERRIDES = {
  "Urban Honolulu|Hawaii": "Honolulu",
  "Boise City|Idaho": "Boise",
  "Louisville/Jefferson County|Kentucky": "Louisville",
  "Nashville-Davidson|Tennessee": "Nashville",
  "Lexington-Fayette|Kentucky": "Lexington",
  "Athens-Clarke County|Georgia": "Athens",
  "Augusta-Richmond County|Georgia": "Augusta",
  "Macon-Bibb County|Georgia": "Macon",
};

function cleanCensusName(name, state) {
  let n = name
    .replace(/\s*\(balance\)$/i, "")
    .replace(/\s+(metropolitan|metro|consolidated|unified)\s+government$/i, "")
    .replace(/\s+(city and borough|city|town|village|borough|municipality|township|CDP|zona urbana|comunidad|plantation|corporation|urban county)$/i, "")
    .trim();
  // "San Buenaventura (Ventura)": the common name is in parentheses; the legal one becomes an alias.
  const paren = n.match(/^(.+?)\s*\((.+)\)$/);
  if (paren) return { name: paren[2], aliases: [paren[1]] };
  // "Hartsville/Trousdale County", "Anaconda-Deer Lodge County": the city is the first part.
  const consolidated = n.match(/^(.+?)[-/].+ County$/);
  if (consolidated) n = consolidated[1];
  return { name: CENSUS_OVERRIDES[`${n}|${state}`] ?? n, aliases: [] };
}

// Current official names where Natural Earth uses an older one; the old name stays searchable.
const RENAMES = { "Gurgaon|IN": "Gurugram" };
// Well-known former or alternate names, so either spelling finds the city.
const EXTRA_ALIASES = {
  "Bengaluru|IN": ["Bangalore"],
  "Mumbai|IN": ["Bombay"],
  "Chennai|IN": ["Madras"],
  "Kolkata|IN": ["Calcutta"],
  "Pune|IN": ["Poona"],
  "Thiruvananthapuram|IN": ["Trivandrum"],
  "Kochi|IN": ["Cochin"],
};
const SKIP_FEATURE_CLASSES = new Set(["Historic place", "Scientific station", "Meteorological Station"]);
// Natural Earth leaves iso_a2 as -99 for a few disputed areas; keep the ones with an ISO code.
const ISO_FALLBACK = { KOS: "XK" };

async function fetchText(url, encoding = "utf-8") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return new TextDecoder(encoding).decode(await res.arrayBuffer());
}

// The Gazetteer ships as a zip holding one text file. Node has inflate but no unzip, and a
// single-entry archive only needs its central directory read, so no dependency for it.
function readSingleFileZip(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record).");
  const central = buffer.readUInt32LE(eocd + 16);
  const method = buffer.readUInt16LE(central + 10);
  const compressedSize = buffer.readUInt32LE(central + 20);
  const localHeader = buffer.readUInt32LE(central + 42);
  const start = localHeader + 30 + buffer.readUInt16LE(localHeader + 26) + buffer.readUInt16LE(localHeader + 28);
  const data = buffer.subarray(start, start + compressedSize);
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error(`Unsupported zip compression method ${method}.`);
}

// GEOID → [lat, lon], rounded to 4 decimals (about 10 m; far finer than a 40-mile radius needs).
async function buildUsCoordinates() {
  const res = await fetch(GAZETTEER_URL);
  if (!res.ok) throw new Error(`${GAZETTEER_URL} responded ${res.status}`);
  const text = new TextDecoder("utf-8").decode(readSingleFileZip(Buffer.from(await res.arrayBuffer())));
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const cols = header.split("\t").map((c) => c.trim());
  const idx = (name) => cols.indexOf(name);
  const coords = new Map();
  for (const row of rows) {
    const f = row.split("\t").map((c) => c.trim());
    const lat = Number(f[idx("INTPTLAT")]);
    const lon = Number(f[idx("INTPTLONG")]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      coords.set(f[idx("GEOID")], [Number(lat.toFixed(4)), Number(lon.toFixed(4))]);
    }
  }
  return coords;
}

async function buildUs() {
  // The Census CSV is Latin-1 (e.g. "Española").
  const [csv, coords] = await Promise.all([fetchText(CENSUS_URL, "latin1"), buildUsCoordinates()]);
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const cols = header.split(",");
  const idx = (name) => cols.indexOf(name);
  const popCol = cols.filter((c) => c.startsWith("POPESTIMATE")).pop();
  const cities = [];
  let missingCoords = 0;
  for (const row of rows) {
    const f = row.split(",");
    if (f[idx("SUMLEV")] !== "162") continue; // 162 = incorporated place or CDP, one row each
    const state = f[idx("STNAME")];
    const pop = Number(f[idx(popCol)]);
    if (!US_STATES[state] || pop < MIN_US_POPULATION) continue;
    const { name, aliases } = cleanCensusName(f[idx("NAME")], state);
    const point = coords.get(f[idx("STATE")] + f[idx("PLACE")]);
    if (point) cities.push([name, state, "US", pop, aliases, point[0], point[1]]);
    else {
      missingCoords++;
      cities.push(aliases.length ? [name, state, "US", pop, aliases] : [name, state, "US", pop]);
    }
  }
  console.log(`US places without Gazetteer coordinates: ${missingCoords}`);
  return cities;
}

async function buildWorld() {
  const geo = JSON.parse(await fetchText(NATURAL_EARTH_URL));
  const cities = [];
  for (const { properties: p } of geo.features) {
    if (SKIP_FEATURE_CLASSES.has(p.featurecla)) continue;
    const cc = /^[A-Z]{2}$/.test(p.iso_a2) ? p.iso_a2 : ISO_FALLBACK[p.adm0_a3];
    if (!cc || cc === "US") continue; // US comes from the Census file
    const name = RENAMES[`${p.name}|${cc}`] ?? p.name;
    const aliases = new Set(
      [p.name, p.nameascii, ...(p.namealt ? p.namealt.split(/[|,]/) : []), ...(EXTRA_ALIASES[`${name}|${cc}`] ?? [])]
        .map((a) => a?.trim())
        .filter((a) => a && a !== name)
    );
    const row = [name, p.adm1name || null, cc, p.pop_max || 0];
    if (aliases.size) row.push([...aliases]);
    cities.push(row);
  }
  return cities;
}

async function main() {
  const [us, world] = await Promise.all([buildUs(), buildWorld()]);
  const cities = [...us, ...world].sort((a, b) => b[3] - a[3]);

  const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  const countries = {};
  for (const [, , cc] of cities) countries[cc] ??= regionNames.of(cc);

  const out = {
    // Row: [city, region (state/province, may be null), ISO 3166-1 alpha-2, population, aliases?, lat?, lon?]
    // US rows carry lat/lon (aliases is then always present, possibly []); non-US rows don't.
    format: ["city", "region", "countryCode", "population", "aliases", "lat", "lon"],
    sources: [
      { name: "U.S. Census Bureau, City and Town Population Totals 2020-2024", url: CENSUS_URL, license: "Public domain (US government work)" },
      { name: "U.S. Census Bureau, 2024 Gazetteer Files (Places)", url: GAZETTEER_URL, license: "Public domain (US government work)" },
      { name: "Natural Earth 1:10m Populated Places", url: NATURAL_EARTH_URL, license: "Public domain" },
    ],
    builtAt: new Date().toISOString().slice(0, 10),
    countries,
    usStates: US_STATES,
    cities,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`Wrote ${cities.length} cities (${us.length} US, ${world.length} elsewhere) to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

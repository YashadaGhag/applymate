import { findPlace, usStateForName, countryNames } from "../geo/cities.js";

// Facts read straight from a posting's text in plain code (no model): whether it says it won't
// sponsor visas, its stated pay range, and its stated years of experience. Each returns null (or
// false) when the text doesn't state the thing clearly; a miss shows nothing, never a guess.

const NO_SPONSORSHIP_PATTERNS = [
  /\bno (visa )?sponsorship\b/i,
  /\bnot (provide|offer)[^.]{0,40}sponsorship\b/i,
  /\bunable to (provide|offer)?\s*sponsor/i,
  /\bwill not sponsor/i,
  /\bdoes not sponsor/i,
  /\bwithout (visa )?sponsorship\b/i,
  /\bnot sponsor(ing)?\b/i,
];

/** True when the posting says it won't sponsor a visa. */
export function statesNoSponsorship(descriptionText) {
  const text = descriptionText ?? "";
  return NO_SPONSORSHIP_PATTERNS.some((re) => re.test(text));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Stated pay ------------------------------------------------------------------------------

// One amount: "$135,000", "$ 148,000", "$180K", "$40.50". Billions/millions ("$200B market",
// "$50M raise") are never pay and are skipped below.
const AMOUNT = String.raw`\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s?([kKmMbB])?`;
const PERIOD_TAIL = String.raw`(?:\s*\/\s*(?:yr|year|hr|hour))?`;
const RANGE = new RegExp(
  String.raw`${AMOUNT}${PERIOD_TAIL}\s*(?:USD)?\s*(?:-|–|—|to|and)\s*${AMOUNT}${PERIOD_TAIL}(?:\s*USD)?`,
  "g"
);
// A dollar sign preceded by a country prefix (CA$, C$, A$, NZ$, AU$, HK$, S$) isn't USD.
const FOREIGN_DOLLAR = /(?:CA|C|A|AU|NZ|HK|S|MX)$/;

const HOURLY_WORDS = /\b(per hour|an hour|hourly)\b|\/\s*(hr|hour)\b/i;
const ANNUAL_WORDS = /\b(per year|a year|annual(ly)?|yearly|salary)\b|\/\s*(yr|year)\b/i;

function toNumber(digits, suffix) {
  const n = Number(digits.replace(/,/g, ""));
  return /k/i.test(suffix ?? "") ? n * 1000 : n;
}

function findRanges(text) {
  const ranges = [];
  for (const m of text.matchAll(RANGE)) {
    const [quote, minDigits, minSuffix, maxDigits, maxSuffix] = m;
    if (/[mb]/i.test(minSuffix ?? "") || /[mb]/i.test(maxSuffix ?? "")) continue;
    if (FOREIGN_DOLLAR.test(text.slice(Math.max(0, m.index - 3), m.index))) continue;
    let min = toNumber(minDigits, minSuffix);
    const max = toNumber(maxDigits, maxSuffix);
    // "$180-230K": the K written once applies to both.
    if (!minSuffix && maxSuffix && /k/i.test(maxSuffix) && min < 1000) min *= 1000;
    if (min > max) continue;

    // The period from words right around the range; an annual figure is also unmistakable by size.
    const around = text.slice(Math.max(0, m.index - 80), m.index + quote.length + 40);
    let period = null;
    if (HOURLY_WORDS.test(around) && max < 1000) period = "hourly";
    else if (ANNUAL_WORDS.test(around) || min >= 10_000) period = "annual";
    if (!period) continue;
    if (period === "annual" && (min < 10_000 || max > 2_000_000)) continue;
    if (period === "hourly" && (min < 7 || max > 1000)) continue;

    ranges.push({ min, max, period, quote: quote.trim(), start: m.index, end: m.index + quote.length });
  }
  return ranges;
}

// Postings name each range's location either just before it ("Zone 1 (New York, NY; Bellevue, WA)
// $196,000 — $230,000") or just after it ("$149,600 - $187,000 in Denver, CO $167,200 - …").
// If any range is directly followed by "in"/"for", the posting writes locations after ranges.
function rangeContexts(text, ranges) {
  const after = ranges.some((r) => /^\s*(?:(?:per year|annually|USD)\s*)?(?:in|for)\s/i.test(text.slice(r.end, r.end + 30)));
  return ranges.map((r, i) => {
    if (after) return text.slice(r.end, ranges[i + 1]?.start ?? r.end + 150);
    const from = i === 0 ? Math.max(0, r.start - 300) : ranges[i - 1].end;
    return text.slice(from, r.start);
  });
}

const US_WORDS = [/\bUnited States\b/i, /\bU\.S\.(A\.)?/, /\bUSA\b/, /\bUS\b/];

let foreignCountryPattern = null;
function namesForeignCountry(text) {
  foreignCountryPattern ??= new RegExp(
    String.raw`\b(${countryNames().filter((n) => n !== "United States").map(escapeRegExp).join("|")})\b`,
    "i"
  );
  return foreignCountryPattern.test(text);
}

// How a job location could be named in a posting's pay text, most specific first.
function termsForPiece(piece) {
  const place = piece.place;
  if (!place || place.kind === "us-unspecified") return { country: true };
  if (place.kind !== "us") return {};
  const parts = piece.text
    .split(",")
    .map((p) => p.replace(/\b(remote|hybrid|on-?site)\b/gi, "").replace(/[-–—]/g, " ").trim());
  const hit = findPlace(parts[0], parts.slice(1));
  if (!hit) return {};
  const state = usStateForName(hit.location.region ?? "");
  const code = hit.location.label.match(/, ([A-Z]{2})$/)?.[1];
  return {
    city: new RegExp(String.raw`\b${escapeRegExp(hit.location.city)}\b`, "i"),
    // Case-sensitive: the full name as a proper noun ("Washington") or the capitalized code
    // ("WA"), so ordinary words ("or", "in", "me") never count as a state.
    state: state
      ? new RegExp([String.raw`\b${escapeRegExp(state)}\b`, code && String.raw`\b${code}\b`].filter(Boolean).join("|"))
      : null,
  };
}

// Which ranges name one of the job's locations. A city name beats a state name. "US" /
// "United States" only counts when the other ranges are for another country ("US: $X … Canada:
// $Y"); between ranges for different parts of the US it says nothing about which one applies.
function rangesForPieces(ranges, contexts, pieces, homePieces) {
  // A remote role is paid by where the employee lives, so the person's own locations count too.
  const remote = pieces.some((p) => !p.place || p.place.kind === "us-unspecified");
  const terms = [...pieces, ...(remote ? homePieces : [])].map(termsForPiece);
  const pick = (test) => ranges.filter((r, i) => terms.some((t) => test(t, contexts[i])));
  const byCity = pick((t, ctx) => t.city?.test(ctx));
  if (byCity.length) return byCity;
  const byState = pick((t, ctx) => t.state?.test(ctx));
  if (byState.length) return byState;
  const usRanges = pick((t, ctx) => t.country && US_WORDS.some((re) => re.test(ctx)) && !namesForeignCountry(ctx));
  const othersForeign = ranges.every((r, i) => usRanges.includes(r) || namesForeignCountry(contexts[i]));
  return usRanges.length && othersForeign ? usRanges : [];
}

/**
 * The posting's stated pay for this job, or null.
 * `pieces` are the job's location pieces that matter here (the ones that pass the person's
 * location check), used to pick between several ranges. `homePieces` are the person's own
 * locations in the same shape; they only count when the job is remote. One distinct range is
 * used as is; several are narrowed to those whose nearby text names one of the pieces (see
 * rangesForPieces); anything still ambiguous is null.
 * Returns { min, max, currency: "USD", period: "annual" | "hourly", quote, source: "posting" }.
 */
export function statedCompensation(descriptionText, pieces = [], homePieces = []) {
  const text = descriptionText ?? "";
  const ranges = findRanges(text);
  if (ranges.length === 0) return null;

  const key = (r) => `${r.min}|${r.max}|${r.period}`;
  const distinct = (list) => [...new Map(list.map((r) => [key(r), r])).values()];
  let chosen = distinct(ranges);
  if (chosen.length > 1) chosen = distinct(rangesForPieces(ranges, rangeContexts(text, ranges), pieces, homePieces));
  if (chosen.length !== 1) return null;

  const { min, max, period, quote } = chosen[0];
  return { min, max, currency: "USD", period, quote, source: "posting" };
}

// ---- Stated years ----------------------------------------------------------------------------

const YEARS_PATTERNS = [
  /\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\+?\s*(?:years|yrs)\b/gi,
  /\b(\d{1,2})\+\s*(?:years|yrs)\b/gi,
  /\b(\d{1,2})\s+or\s+more\s+(?:years|yrs)\b/gi,
  /\b(?:at least|minimum of|min\.?)\s+(\d{1,2})\s+(?:years|yrs)\b/gi,
];

const TITLE_STOP_WORDS = new Set([
  "senior", "sr", "staff", "lead", "principal", "junior", "jr", "associate", "i", "ii", "iii", "iv",
  "the", "and", "of", "for", "to", "a", "an", "with", "remote", "eligible",
]);

/**
 * The posting's stated years of experience, or null. Only counts mentions next to the word
 * "experience". Several different numbers are narrowed to those near a word from the job title
 * (the role's own work, e.g. "Designer" → "design"); still several → null.
 * Returns { min, max | null, quote, source: "posting" }.
 */
export function statedYearsOfExperience(descriptionText, title) {
  const text = descriptionText ?? "";
  const found = [];
  for (const re of YEARS_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const window = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 100);
      if (!/\bexperience\b/i.test(window)) continue;
      const min = Number(m[1]);
      const max = re === YEARS_PATTERNS[0] ? Number(m[2]) : null;
      if (min > 30 || (max !== null && (max < min || max > 40))) continue;
      // Quote to the end of the phrase: "7+ years of experience as a Product Designer".
      const tail = text.slice(m.index).match(/^[^.;•\n]{0,110}/)[0];
      const quote = (tail.length === 110 ? tail.replace(/\s+\S*$/, "") : tail).trim();
      found.push({ min, max, quote, window, index: m.index });
    }
  }
  if (found.length === 0) return null;

  // The same mention can match two patterns ("2-4+ years"); keep one per position.
  const byIndex = [...new Map(found.map((f) => [f.index, f])).values()];
  const key = (f) => `${f.min}|${f.max}`;
  const distinct = (list) => [...new Map(list.map((f) => [key(f), f])).values()];
  let chosen = distinct(byIndex);

  if (chosen.length > 1) {
    const roots = (title ?? "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !TITLE_STOP_WORDS.has(w))
      .map((w) => w.replace(/(ers|er|or|ing|s)$/, ""))
      .filter((r) => r.length > 2);
    chosen = distinct(byIndex.filter((f) => roots.some((r) => f.window.toLowerCase().includes(r))));
  }
  if (chosen.length !== 1) return null;

  const { min, max, quote } = chosen[0];
  return { min, max, quote, source: "posting" };
}

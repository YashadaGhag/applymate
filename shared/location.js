// Locations are stored as { label, city, region, country, countryCode } (see server/geo/cities.js).
// countryCode is ISO 3166-1 alpha-2, or null when free text couldn't be placed in a country.
// Profiles saved before this were plain strings; locationLabel() accepts both.
//
// Locations are always real places. "Remote" is a work mode (the Remote checkbox on the Role
// page), so remote-only text ("Remote", "Remote (US)", "US Remote") is never stored as a location.

export function locationLabel(loc) {
  return typeof loc === 'string' ? loc : loc?.label ?? '';
}

// Mirrors REMOTE_ONLY_PATTERN in server/geo/cities.js.
const REMOTE_ONLY_PATTERN =
  /^((fully\s+)?remote(\W*\(?(us|usa|u\.s\.?|united states|anywhere|worldwide)\)?)?|(us|usa|u\.s\.?|united states)\W*remote)$/i;

// True for text, or a saved location, that only says "remote". This includes the
// { label: "Remote (US)", remote: true } entries that were briefly offered as a location.
export function isRemoteOnly(locOrText) {
  if (locOrText && typeof locOrText === 'object') {
    return locOrText.remote === true || REMOTE_ONLY_PATTERN.test(locOrText.label ?? '');
  }
  return REMOTE_ONLY_PATTERN.test((locOrText ?? '').trim());
}

// The US and its territories, which all fall under US work authorization.
const US_COUNTRY_CODES = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM']);

export function isUsLocation(loc) {
  return typeof loc === 'object' && US_COUNTRY_CODES.has(loc?.countryCode);
}

// Typed text that wasn't picked from the results. Nothing is guessed: only the label and city.
export function freeTextLocation(text) {
  const label = text.trim();
  return { label, city: label.split(',')[0].trim(), region: null, country: null, countryCode: null };
}

// Picks the search result that typed text unambiguously means: the same label, or the only
// result with that city name ("seattle" → Seattle, WA). Returns null when it's ambiguous
// ("portland") or absent, so the caller keeps free text instead of guessing.
export function matchTypedLocation(text, results) {
  const typed = text.trim().toLowerCase();
  const byLabel = results.find((loc) => loc.label.toLowerCase() === typed);
  if (byLabel) return byLabel;
  const sameCity = results.filter((loc) => loc.city?.toLowerCase() === typed);
  return sameCity.length === 1 ? sameCity[0] : null;
}

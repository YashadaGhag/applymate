// Browser-only: location calls to our server (fetch with relative URLs). The pure helpers live in
// shared/location.js.
import { freeTextLocation, isRemoteOnly } from "../../shared/location.js";

// City search through our server (offline dataset). Throws on network errors and aborts;
// the caller handles stale or cancelled requests.
export async function searchLocations(query, signal) {
  const res = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`/api/locations/search responded ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

// Cleans up saved locations when a profile loads. Never throws.
// - Remote-only entries (a saved "Remote (US)", or a string like "Remote") are removed, and
//   `remote: true` is returned so the caller can tick the Remote work mode instead.
// - Plain strings from before locations were structured are upgraded to objects; if the server
//   can't be reached, each becomes free text so the page keeps working.
// Returns { locations, remote }.
export async function normalizeSavedLocations(saved) {
  const list = Array.isArray(saved) ? saved : [];
  const remote = list.some(isRemoteOnly);
  const places = list.filter((loc) => !isRemoteOnly(loc));

  const strings = places.filter((l) => typeof l === 'string');
  if (strings.length === 0) return { locations: places, remote };

  let resolved = [];
  try {
    const res = await fetch('/api/locations/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: strings }),
    });
    if (res.ok) resolved = (await res.json()).locations ?? [];
  } catch (err) {
    console.warn('[locations] could not resolve saved locations, keeping them as free text:', err);
  }
  let i = 0;
  const locations = places.map((loc) => {
    if (typeof loc !== 'string') return loc;
    const match = resolved[i++];
    return match ?? freeTextLocation(loc);
  });
  return { locations, remote };
}

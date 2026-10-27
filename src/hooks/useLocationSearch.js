import { useEffect, useRef, useState } from "react";
import { searchLocations } from "../utils/locationSearch.js";

const LOCATION_SEARCH_DEBOUNCE_MS = 250;
const LOCATION_SEARCH_MIN_CHARS = 2;

// Type-ahead city search against our server (offline dataset). Same pattern as the company
// search: debounce, 2+ characters, ignore stale responses. Each query is fetched once per page
// visit, so resultsFor() can wait on a search that's still in flight.
// A failed search just shows no suggestions; typed text can still be added as free text.
// Shared by the Role page and the Change Preferences location modal.
export function useLocationSearch() {
  const [results, setResults] = useState([]);
  const timer = useRef(null);
  const latestQuery = useRef("");
  const requests = useRef(new Map());

  useEffect(() => () => clearTimeout(timer.current), []);

  const fetchFor = (query) => {
    const key = query.toLowerCase();
    if (!requests.current.has(key)) {
      const request = searchLocations(query).catch((err) => {
        console.warn("[locations] search failed:", err);
        requests.current.delete(key); // don't keep a failure; the next try can succeed
        return [];
      });
      requests.current.set(key, request);
    }
    return requests.current.get(key);
  };

  const search = (text) => {
    const query = text.trim();
    latestQuery.current = query;
    clearTimeout(timer.current);
    if (query.length < LOCATION_SEARCH_MIN_CHARS) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      fetchFor(query).then((found) => {
        if (latestQuery.current === query) setResults(found);
      });
    }, LOCATION_SEARCH_DEBOUNCE_MS);
  };

  // Results for exactly this text, skipping the debounce. Reuses a pending or finished request.
  const resultsFor = (text) => {
    const query = text.trim();
    return query.length < LOCATION_SEARCH_MIN_CHARS ? Promise.resolve([]) : fetchFor(query);
  };

  return { results, search, resultsFor };
}

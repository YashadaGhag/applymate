import { useEffect, useMemo, useRef, useState } from "react";
import { latestOnly, mergeRoleSuggestions, safeRoleSuggestions } from "../utils/roleSuggestions";

const ROLE_SEARCH_DEBOUNCE_MS = 250;

/**
 * Designation suggestions for a MultiselectChips: the resume's roles first, then the server's
 * (GET /api/roles/suggestions), same pattern as useLocationSearch: debounced while typing, each
 * query fetched once per page visit, and a slow answer never overwrites a newer one. The route reads
 * only what is scraped so far and falls back to a bundled list, so it works on the Role page before
 * any scrape. A failed request leaves the resume roles only: no banner, free text still works.
 *
 *   const { suggestions, onInputChange } = useRoleSuggestions({ resumeRoles, selected: roles });
 *   <MultiselectChips suggestions={suggestions} filterSuggestions={false} showWhenEmpty
 *     onInputChange={onInputChange} ... />
 */
export function useRoleSuggestions({ resumeRoles = [], selected = [] }) {
  const [typed, setTyped] = useState("");
  const [server, setServer] = useState([]);
  const timer = useRef(null);
  const requests = useRef(new Map());
  const newest = useRef(latestOnly());

  const fetchFor = (query) => {
    const key = query.toLowerCase();
    if (!requests.current.has(key)) {
      const request = safeRoleSuggestions(query).then((titles) => {
        if (titles.length === 0) requests.current.delete(key); // don't keep a failure
        return titles;
      });
      requests.current.set(key, request);
    }
    return requests.current.get(key);
  };

  useEffect(() => {
    newest.current(fetchFor(""), setServer); // the top suggestions, for an empty field
    return () => clearTimeout(timer.current);
  }, []);

  const onInputChange = (text) => {
    const query = text.trim();
    setTyped(query);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => newest.current(fetchFor(query), setServer), ROLE_SEARCH_DEBOUNCE_MS);
  };

  const suggestions = useMemo(
    () => mergeRoleSuggestions({ resumeRoles, server, selected, typed }),
    [resumeRoles, server, selected, typed]
  );
  return { suggestions, onInputChange };
}

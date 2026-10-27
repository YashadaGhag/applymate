import { useCallback, useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

/**
 * Company search against /api/companies/search (Logo.dev proxy), shared by the onboarding
 * watchlist and the Change Preferences Add company dialog: debounce ~250ms, 2+ characters,
 * AbortController, stale responses ignored, results replace the list in place.
 * status: idle | loading | results | no-results | error. `errorCode` is the server's code for an error
 * answer (null for any other failure), see src/utils/companySearchError.js.
 */
export function useCompanySearch() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [errorCode, setErrorCode] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const latestQueryRef = useRef("");

  const runSearch = useCallback(async (q) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    latestQueryRef.current = q;

    setStatus("loading");
    try {
      const res = await fetch(`/api/companies/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const error = new Error("search failed");
        error.code = body?.code ?? null;
        throw error;
      }
      const data = await res.json();

      if (latestQueryRef.current !== q) return; // stale response

      setErrorCode(null);
      setResults(data.results || []);
      setStatus(data.results?.length ? "results" : "no-results");
      setHighlightedIndex(-1);
    } catch (err) {
      if (err.name === "AbortError") return;
      if (latestQueryRef.current !== q) return;
      setErrorCode(err.code ?? null);
      setStatus("error");
    }
  }, []);

  const trimmedQuery = query.trim();
  const isSearchActive = trimmedQuery.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!isSearchActive) {
      abortRef.current?.abort();
      return;
    }

    debounceRef.current = setTimeout(() => runSearch(trimmedQuery), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [trimmedQuery, isSearchActive, runSearch]);

  const resetSearch = () => {
    abortRef.current?.abort();
    setQuery("");
    setStatus("idle");
    setResults([]);
    setErrorCode(null);
    setHighlightedIndex(-1);
  };

  return {
    query,
    setQuery,
    status,
    results,
    errorCode,
    highlightedIndex,
    setHighlightedIndex,
    isSearchActive,
    runSearch,
    resetSearch,
  };
}

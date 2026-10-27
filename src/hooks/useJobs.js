import { useEffect, useState } from "react";

const EMPTY_RESULT = { watchlistGroups: [], others: [], lastUpdatedAt: null, hasNewWatchlistJobs: false };

/**
 * The single data source for the Job Recommendations page. Fetches /api/jobs, which already
 * returns both tabs filtered, scored-only and ranked server-side: watchlist groups (grouped by
 * watchlist company id, never domain) and Others (top 30 by score).
 *
 * Persisting "last viewed the watchlist tab" (the write side hasNewWatchlistJobs depends on)
 * isn't built yet, so the server always reports it false for now — this hook doesn't track
 * viewed-state locally any more than that.
 *
 * refreshKey: changing it refetches in the background (e.g. after a dismiss reaches the server,
 * so the next job fills a dismissed one's spot). The current lists stay on screen meanwhile; only
 * the first load shows "loading", and a failed refetch keeps what's already shown.
 */
export function useJobs(refreshKey = 0) {
  const [state, setState] = useState({ ...EMPTY_RESULT, status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/jobs")
      .then((res) => {
        if (!res.ok) throw new Error(`unexpected status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setState({ ...data, status: "ready" });
      })
      .catch(() => {
        if (!cancelled) setState((prev) => (prev.status === "ready" ? prev : { ...EMPTY_RESULT, status: "error" }));
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return state;
}

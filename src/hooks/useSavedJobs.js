import { useEffect, useState } from "react";

/**
 * The Saved Jobs page's rows from GET /api/saved-jobs (light job shape plus savedAt, newest saved
 * first). status: "loading" | "ready" | "error".
 */
export function useSavedJobs() {
  const [state, setState] = useState({ status: "loading", savedJobs: [] });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/saved-jobs")
      .then((res) => {
        if (!res.ok) throw new Error(`unexpected status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", savedJobs: data.savedJobs ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", savedJobs: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

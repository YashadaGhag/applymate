import { useCallback, useEffect, useRef, useState } from "react";
import { runJustEnded } from "../utils/updateStatus";

const POLL_MS = 5000;

/**
 * The daily background update (server/scheduler/), for the Job Recommendations page only:
 * GET /api/jobs/update-status on mount, again every 5 seconds only while the state is "running"
 * (never otherwise, and not after unmount), and once more when the tab becomes visible again so a
 * run that started while the tab was in the background is noticed. Plain GETs: they start nothing
 * and make no AI call.
 *
 * Returned: { status } — null until loaded, then { state: "idle" | "running" | "failed", phase,
 * startedAt, finishedAt, outcome, newJobs, ... }.
 * onFinished(status) runs when a run this page watched ends (the read after a "running" one).
 */
export function useUpdateStatus({ onFinished } = {}) {
  const [status, setStatus] = useState(null);
  const latest = useRef(null); // the last status read, to tell a watched run ending
  const mounted = useRef(true);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  // Takes one read: updates the page and tells it when a run it was watching has ended.
  const apply = useCallback((next) => {
    if (!mounted.current) return;
    const previous = latest.current;
    latest.current = next;
    setStatus(next);
    if (runJustEnded(previous, next)) onFinishedRef.current?.(next);
  }, []);

  const read = useCallback(
    () =>
      fetch("/api/jobs/update-status")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`/api/jobs/update-status responded ${res.status}`))))
        .then(apply)
        .catch((err) => console.warn("[update] could not read the status:", err)),
    [apply]
  );

  useEffect(() => {
    mounted.current = true;
    read();
    const onVisible = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [read]);

  const state = status?.state;
  useEffect(() => {
    if (state !== "running") return undefined;
    const timer = setInterval(read, POLL_MS);
    return () => clearInterval(timer);
  }, [state, read]);

  return { status };
}

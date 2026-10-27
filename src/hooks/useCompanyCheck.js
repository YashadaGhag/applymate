import { useCallback, useEffect, useRef, useState } from "react";
import { loaderState } from "../utils/companyCheck";

const POLL_MS = 2000;

/**
 * The onboarding loader after Save: reads GET /api/jobs/update-status?watchlist=1 every 2 seconds
 * while the loader is waiting (checking or taking longer), and stops once it settles on a result.
 * It only reads: the background work was started by the watchlist save (and runs without this page),
 * and a plain GET never starts anything. `retry()` is the one write, the Try again click
 * (POST /api/watchlist/retry), after which it reads again at once.
 *
 * Returns { loader, retry }: `loader` is what loaderState() maps (src/utils/companyCheck.js).
 */
export function useCompanyCheck() {
  const [status, setStatus] = useState(null);
  const [retrying, setRetrying] = useState(false);
  // The longer-state clock: when this wait started (a retry starts it over) and the current time,
  // ticked once a second only while waiting.
  const [clock, setClock] = useState(() => ({ startedAt: Date.now(), now: Date.now() }));
  const mounted = useRef(true);

  const read = useCallback(
    () =>
      fetch("/api/jobs/update-status?watchlist=1")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`/api/jobs/update-status responded ${res.status}`))))
        .then((next) => {
          if (!mounted.current) return;
          setStatus(next);
        })
        .catch((err) => console.warn("[company check] could not read the status:", err)),
    []
  );

  useEffect(() => {
    mounted.current = true;
    read();
    return () => {
      mounted.current = false;
    };
  }, [read]);

  const elapsedMs = clock.now - clock.startedAt;
  const loader = loaderState({ status, elapsedMs, retrying });
  const waiting = loader.kind === "checking" || loader.kind === "longer";

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(read, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, read]);

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => setClock((c) => ({ ...c, now: Date.now() })), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const retry = useCallback(async () => {
    setRetrying(true);
    setClock({ startedAt: Date.now(), now: Date.now() });
    try {
      await fetch("/api/watchlist/retry", { method: "POST" });
    } catch (err) {
      console.warn("[company check] could not start the retry:", err);
    }
    await read();
    if (mounted.current) setRetrying(false);
  }, [read]);

  return { loader, retry };
}

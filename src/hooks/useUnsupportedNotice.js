import { useCallback, useEffect, useRef, useState } from "react";
import { unsupportedCompanies } from "../utils/unsupportedNotice";

const POLL_MS = 3000;
const MAX_POLLS = 40;

/**
 * The "we can't check these companies yet" notice (Change Preferences > Company Watchlist). Reads
 * companyMeta from GET /api/state when the list changes, and again once the background detection a
 * save starts has finished (it polls GET /api/jobs/update-status only while a run is going, at most
 * about two minutes), so a company added now is noticed without a reload. Plain GETs: nothing
 * starts, and nothing is stored about the notice.
 *
 * Returns { companies } (the unsupported ones, in list order).
 */
export function useUnsupportedNotice(watchlist) {
  const [meta, setMeta] = useState(null);
  const mounted = useRef(true);
  const key = (watchlist ?? []).map((c) => c.id).join(",");

  const read = useCallback(
    () =>
      fetch("/api/state")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`/api/state responded ${res.status}`))))
        .then((state) => mounted.current && setMeta(state.companyMeta ?? {}))
        .catch((err) => console.warn("[unsupported notice] could not read the state:", err)),
    []
  );

  useEffect(() => {
    mounted.current = true;
    let timer = null;
    let polls = 0;
    const settle = () => {
      polls += 1;
      fetch("/api/jobs/update-status")
        .then((res) => (res.ok ? res.json() : null))
        .then((status) => {
          if (!mounted.current) return;
          if (status?.state === "running" && polls < MAX_POLLS) {
            timer = setTimeout(settle, POLL_MS);
          } else {
            read();
          }
        })
        .catch(() => {});
    };
    read().then(() => {
      if (mounted.current) timer = setTimeout(settle, POLL_MS);
    });
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [key, read]);

  return { companies: unsupportedCompanies(watchlist, meta) };
}

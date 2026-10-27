import { useEffect } from "react";

const URL = "/api/user-state/last-viewed/watchlist";

// Best-effort and silent: a failed write never blocks navigation or shows an error. The server
// stamps its own clock; the browser sends no time. `keepalive` lets it finish while the page closes.
function send(query = "") {
  try {
    fetch(`${URL}${query}`, { method: "PUT", keepalive: true }).catch(() => {});
  } catch {
    // nothing to do
  }
}

// A leave is sent on the next tick, and cancelled if the page mounts again straight away. That
// is React StrictMode's simulated unmount in dev, which must never stamp on arrival.
let pendingLeave = null;

/**
 * The red dot's "last viewed" (userState.lastViewed.watchlist), for Job Recommendations:
 *  - on arrival it only asks the server to set it if it has never been set (`ifUnset`), so day one
 *    has no dot. Arrival never moves an existing value, so the dot stays through the visit that
 *    found the jobs;
 *  - when the person LEAVES the page (the route changes away, the tab is hidden or closed) it
 *    stamps "now" on the server, which clears the dot for the next visit.
 * Switching between the Watchlist and Others tabs is not leaving (they are one page).
 * Plain PUTs: no scrape, no scoring, no AI call.
 */
export function useWatchlistLastViewed() {
  useEffect(() => {
    clearTimeout(pendingLeave);
    pendingLeave = null;
    send("?ifUnset=true");

    const onVisibility = () => {
      if (document.visibilityState === "hidden") send();
    };
    const onPageHide = () => send();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      pendingLeave = setTimeout(() => {
        pendingLeave = null;
        send();
      }, 0);
    };
  }, []);
}

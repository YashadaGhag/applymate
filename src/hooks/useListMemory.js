import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { patchView, readView, rememberList, shouldRestore } from "../utils/listView";

/**
 * Remembers where a list page is left (Job Recommendations, Application Tracker, Saved Jobs), so Job
 * Details can return to exactly that place. The tab, page, sort, search and filter are in the page's
 * URL query (the page owns those); this keeps the rest: which list was last shown (the back target), the
 * scroll position and the company groups opened with "See all N jobs", in sessionStorage.
 *
 * Arriving by back/forward/reload (POP) or through a return link (`state.restoreView`) puts the scroll
 * and the open groups back once `ready` (the list has rendered); any other arrival (the side nav, a
 * link) starts at the top with nothing open. Moving to another view inside the page (a tab, a page)
 * starts that view at the top. Returns { expanded: Set, expandGroup(key) }.
 */
export function useListMemory(ready) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const url = location.pathname + location.search;

  // Decided once, on arrival.
  const [restored] = useState(() => (shouldRestore(navigationType, location.state) ? readView(url) : null));
  const [expanded, setExpanded] = useState(() => new Set(restored?.expanded ?? []));
  const expandedRef = useRef(expanded);
  const restoredUrl = useRef(restored ? url : null);
  // The scroll position is only written once the page has been put right (a record being restored
  // must not be overwritten by the page's top-of-page start).
  const armed = useRef(false);

  useLayoutEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  // This URL is now the list to go back to; a view reached inside the page starts at the top.
  useLayoutEffect(() => {
    rememberList(url);
    if (restoredUrl.current !== url) patchView(url, { scrollY: 0, expanded: [...expandedRef.current] });
  }, [url]);

  // Layout effects so the listener is gone before the next page's layout can clamp the scroll position.
  useLayoutEffect(() => {
    // A short timer rather than a frame, so it also runs while the page is in a background tab.
    let timer = 0;
    const onScroll = () => {
      if (!armed.current || timer) return;
      timer = setTimeout(() => {
        timer = 0;
        patchView(url, { scrollY: window.scrollY });
      }, 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      // Leaving within the throttle window still keeps the latest position.
      if (timer) {
        clearTimeout(timer);
        patchView(url, { scrollY: window.scrollY });
      }
      window.removeEventListener("scroll", onScroll);
    };
  }, [url]);

  useLayoutEffect(() => {
    if (!ready || armed.current) return;
    if (restored && restored.scrollY > 0) window.scrollTo(0, restored.scrollY);
    armed.current = true;
  }, [ready, restored]);

  const expandGroup = useCallback(
    (key) => {
      setExpanded((prev) => {
        const next = new Set(prev).add(key);
        patchView(url, { expanded: [...next] });
        return next;
      });
    },
    [url]
  );

  return { expanded, expandGroup };
}

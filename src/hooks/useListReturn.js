import { useState } from "react";
import { lastListUrl, resolveReturn } from "../utils/listView";

/**
 * Where "back" goes from Job Details and Customize Application: the list view last shown in this tab
 * (Job Recommendations, Application Tracker or Saved Jobs, with its tab / page / sort / search / filter in
 * the URL), else Job Recommendations' default view (a direct link, a new tab). Read once on arrival, so the
 * link doesn't change under the person. `state` marks the arrival as a return, which makes the list put
 * its scroll position and opened company groups back.
 */
export function useListReturn() {
  const [target] = useState(() => resolveReturn(lastListUrl()));
  return { to: target.to, label: target.label, state: { restoreView: true } };
}

// Browser-only: the click handler for links in documents shown without an editor.
// The link rule itself lives in shared/linkUrl.js.
import { isAllowedHref } from "../../shared/linkUrl.js";

/**
 * Click handler for documents shown without an editor (read-only view, mobile): a click on a link
 * opens it in a new tab, never in this one. The tab gets no opener and no referrer. Returns true
 * when it handled the click. A mailto link is handed to the mail app instead of a blank tab.
 */
export function openDocumentLink(event) {
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor) return false;
  event.preventDefault();
  const href = anchor.getAttribute("href");
  if (!isAllowedHref(href)) return true;
  if (/^mailto:/i.test(href)) window.location.href = href;
  else window.open(href, "_blank", "noopener,noreferrer");
  return true;
}

import { SEARCH_NOT_CONFIGURED } from "../../shared/companySearchError.js";

export const SEARCH_NOT_CONFIGURED_MESSAGE =
  "Company search isn't set up. Add LOGO_DEV_SECRET_KEY to your .env file and restart the app.";
export const SEARCH_FAILED_MESSAGE = "Something went wrong searching for companies.";

/** What the search error state shows. A missing key can't be fixed by retrying, so it gets no Retry button. */
export function searchErrorInfo(code) {
  if (code === SEARCH_NOT_CONFIGURED) return { message: SEARCH_NOT_CONFIGURED_MESSAGE, canRetry: false };
  return { message: SEARCH_FAILED_MESSAGE, canRetry: true };
}

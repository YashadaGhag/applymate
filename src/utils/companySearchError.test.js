// Run with: node --test src/utils/companySearchError.test.js
// Which message the search error state shows, and whether it offers Retry: no browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchErrorInfo, SEARCH_NOT_CONFIGURED_MESSAGE, SEARCH_FAILED_MESSAGE } from "./companySearchError.js";

test("the missing-key code gets the setup message and no Retry", () => {
  const info = searchErrorInfo("search_not_configured");
  assert.equal(info.message, "Company search isn't set up. Add LOGO_DEV_SECRET_KEY to your .env file and restart the app.");
  assert.equal(info.message, SEARCH_NOT_CONFIGURED_MESSAGE);
  assert.equal(info.canRetry, false);
});

test("every other error keeps today's message and Retry", () => {
  for (const code of [null, undefined, "", "bad_gateway", "SEARCH_NOT_CONFIGURED"]) {
    const info = searchErrorInfo(code);
    assert.equal(info.message, "Something went wrong searching for companies.");
    assert.equal(info.message, SEARCH_FAILED_MESSAGE);
    assert.equal(info.canRetry, true);
  }
});

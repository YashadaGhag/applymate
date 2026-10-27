// A tiny hook between PUT /api/watchlist and the scheduler, so the route does not import the
// scheduler (which imports the routes). The scheduler registers its handler when it starts, and only
// when it is enabled: with APPLYMATE_SCHEDULER=off, or in tests, nothing is registered and a
// watchlist save only writes the list.
let handler = null;

export function setWatchlistSavedHandler(fn) {
  handler = fn;
}

/** Called after the watchlist was saved and the response sent. Never throws, never awaited. */
export function notifyWatchlistSaved() {
  if (!handler) return;
  Promise.resolve()
    .then(() => handler())
    .catch((err) => console.warn(`[scheduler] new-company work failed to start: ${err.message}`));
}

// The Role page's Continue (the one signal that starts the Others scrape and scoring before any
// company exists). Same idea: the scheduler registers the handler when it is enabled; with
// APPLYMATE_SCHEDULER=off, or in tests, nothing is registered and the route only answers.
let othersHandler = null;

export function setOthersStartHandler(fn) {
  othersHandler = fn;
}

/**
 * Called by POST /api/onboarding/start-others. Returns at once: { accepted, reason? }. The work
 * itself runs in the background and its failures are logged, never thrown.
 */
export function requestOthersStart() {
  if (!othersHandler) return { accepted: false, reason: "the scheduler is off" };
  try {
    return othersHandler();
  } catch (err) {
    console.warn(`[scheduler] Others start failed to register: ${err.message}`);
    return { accepted: false, reason: "error" };
  }
}

// Try again on the onboarding loader (POST /api/watchlist/retry): same pattern. Registered only
// when the scheduler is enabled, so with APPLYMATE_SCHEDULER=off (or in tests) the route only
// answers { accepted: false }, and the loader knows nothing will run.
let retryHandler = null;

export function setCompanyRetryHandler(fn) {
  retryHandler = fn;
}

/** True when background watchlist work is on (the scheduler registered its handlers). */
export const backgroundWorkEnabled = () => retryHandler !== null;

export function requestCompanyRetry() {
  if (!retryHandler) return { accepted: false, reason: "the scheduler is off" };
  try {
    return retryHandler();
  } catch (err) {
    console.warn(`[scheduler] retry failed to start: ${err.message}`);
    return { accepted: false, reason: "error" };
  }
}

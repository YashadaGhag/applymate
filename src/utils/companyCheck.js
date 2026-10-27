// The onboarding loader after Save: which of the four states to show, and its copy (Figma 2862:14179
// Checking companies, 2862:14187 Taking longer, 2862:14194 Some companies not checked, 2862:14205
// Failed). Pure functions of what GET /api/jobs/update-status?watchlist=1 returns, so they are tested
// without a browser. The page only reads; nothing here starts work.

// How long the person has waited on the loader before it says "Still checking". A scrape of a
// handful of careers pages plus scoring usually ends well inside this; the daily banner promises
// "up to 5 minutes", which is the long case this state prepares for.
export const LONGER_AFTER_MS = 30 * 1000;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * { kind, rolesFound, companiesWithRoles, total, checked, notChecked }
 * kind:
 *   "checking"  the background work is running or about to run
 *   "longer"    still working after LONGER_AFTER_MS
 *   "partial"   it finished and some companies were not checked (some were)
 *   "failed"    it finished and nothing could be checked (or the scoring step failed)
 *   "done"      nothing to wait for: go on to Job Recommendations
 * `retrying` is true from the Try again click until the next read, so the screen never flashes the
 * old result.
 */
export function loaderState({ status, elapsedMs = 0, retrying = false }) {
  const w = status?.watchlist;
  const base = {
    rolesFound: w?.rolesFound ?? 0,
    companiesWithRoles: w?.companiesWithRoles ?? 0,
    total: w?.total ?? 0,
    checked: w ? w.total - w.notChecked.length : 0,
    notChecked: w?.notChecked ?? [],
  };
  // Nothing read yet: the first state, with no numbers.
  if (!w) return { kind: "checking", ...base };
  // Background work is off (APPLYMATE_SCHEDULER=off): nothing will ever change here, so don't wait.
  if (!w.enabled) return { kind: "done", ...base };

  const working = retrying || status.state === "running" || w.waiting > 0;
  if (working) return { kind: elapsedMs >= LONGER_AFTER_MS ? "longer" : "checking", ...base };

  // Finished. A company with no supported source is not in notChecked (the server leaves it out).
  if (w.notChecked.length > 0) return { kind: w.scraped === 0 ? "failed" : "partial", ...base };
  if (w.scoringFailed) return { kind: "failed", ...base };
  return { kind: "done", ...base };
}

/** The copy for a state: { heading, body, lines }. `lines` are the not-checked companies. */
export function loaderCopy(loader) {
  const { kind, rolesFound, companiesWithRoles, total, checked, notChecked } = loader;
  if (kind === "longer") {
    return { heading: "Still checking", body: "Some career pages are slow. This can take up to 5 minutes.", lines: [] };
  }
  if (kind === "partial") {
    const found = rolesFound > 0 ? `Found ${plural(rolesFound, "role", "roles")} so far. ` : "";
    const rest =
      notChecked.length === 1
        ? "We couldn’t reach this careers page, so we’ll try it again automatically."
        : "We couldn’t reach these careers pages, so we’ll try them again automatically.";
    return {
      heading: `Checked ${checked} of ${plural(total, "company", "companies")}`,
      body: `${found}${rest}`,
      lines: notChecked.map((c) => `${c.name}: careers page didn’t respond`),
    };
  }
  if (kind === "failed") {
    return {
      heading: "We couldn’t check your companies",
      body: "Your list is saved. We’ll try again automatically, or you can try now.",
      lines: [],
    };
  }
  // checking (and the first moment, before any numbers)
  return {
    heading: "Checking your companies",
    // Before any role is scored, "Found 0 roles" would only be noise: say what is being done.
    body:
      rolesFound > 0
        ? `Found ${plural(rolesFound, "role", "roles")} at ${plural(companiesWithRoles, "company", "companies")} so far`
        : total > 0
          ? `Checking ${plural(total, "company", "companies")}`
          : "",
    lines: [],
  };
}

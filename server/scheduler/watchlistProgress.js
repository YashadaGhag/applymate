import { matchBand } from "../ai/matchBand.js";

// What the onboarding loader after Save shows about the watchlist, as a plain function of the
// stored data (nothing is run, no AI, no network). Read through
// GET /api/jobs/update-status?watchlist=1.
//
// Per company, from companyMeta (server-owned, see newCompanies.js):
//   no entry                                  waiting: detection has not happened yet
//   scrapeStatus "error"                      notChecked: the careers page could not be reached
//   scrapeStatus "ok" + scrapePending         waiting, or notChecked when `workFailedAt` is set (a scrape
//                                             of it failed; the work retries it automatically)
//   scrapeStatus "ok", not pending            checked (scraped)
//   scrapeStatus "no_source"                  checked: not a failure, it is never listed as one (its
//                                             own one-time notice is a separate task)
// rolesFound / companiesWithRoles count what the Watchlist tab would list: open jobs of watchlist
// companies scored for the current resume at 50 or more (matchBand), so the number only rises as
// scoring goes and never promises a role the page would hide.

export function watchlistProgress({ watchlist, companyMeta, jobs, scores, resumeVersion, enabled, lastRun }) {
  const list = watchlist ?? [];
  const notChecked = [];
  let waiting = 0;
  let scraped = 0;

  for (const company of list) {
    const meta = companyMeta?.[company.id];
    if (!meta?.scrapeStatus) waiting += 1;
    else if (meta.scrapeStatus === "error") notChecked.push({ id: company.id, name: company.name });
    else if (meta.scrapeStatus === "ok" && meta.scrapePending) {
      if (meta.workFailedAt) notChecked.push({ id: company.id, name: company.name });
      else waiting += 1;
    } else if (meta.scrapeStatus === "ok") scraped += 1;
  }

  const ids = new Set(list.map((c) => c.id));
  const withRoles = new Set();
  let rolesFound = 0;
  for (const job of jobs ?? []) {
    const companyId = job.company?.id;
    if (job.closed || !ids.has(companyId)) continue;
    const entry = scores?.[job.id];
    if (!entry || !resumeVersion || entry.resumeVersion !== resumeVersion || matchBand(entry.score) === null) continue;
    rolesFound += 1;
    withRoles.add(companyId);
  }

  return {
    enabled: Boolean(enabled),
    total: list.length,
    waiting,
    scraped,
    notChecked,
    rolesFound,
    companiesWithRoles: withRoles.size,
    // The last new-company run got through scraping but could not score; Try again scores.
    scoringFailed: lastRun?.kind === "new-companies" && lastRun.outcome === "failed" && lastRun.failedPhase === "scoring",
  };
}

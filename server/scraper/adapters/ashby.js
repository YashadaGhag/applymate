import { sanitizeDescriptionHtml } from "../sanitizeDescription.js";
import { fetchBoardJobs } from "./http.js";

// Ashby public job board (an ATS adapter). Response shapes verified by hand: 404 -> plain-text
// "Not Found" (not JSON); valid board -> 200 {"jobs":[...], "apiVersion":"1"}. publishedAt is a
// genuine posted date; descriptionPlain is plain text; compensation.summaryComponents has real
// employer-entered min/max/currency when a board discloses it (confirmed live on Ramp's board),
// empty array when it doesn't (Notion's board).

const extractRawJobs = (data) => (Array.isArray(data?.jobs) ? data.jobs : null);

// Ashby only returns compensation at all when the request includes ?includeCompensation=true,
// and even then summaryComponents is empty for boards that opted out of disclosure.
function normalizeAshbyCompensation(compensation) {
  const components = compensation?.summaryComponents;
  if (!Array.isArray(components)) return null;
  const salary = components.find(
    (c) => c.compensationType === "Salary" && (c.minValue != null || c.maxValue != null)
  );
  if (!salary) return null;
  return { min: salary.minValue ?? null, max: salary.maxValue ?? null, currency: salary.currencyCode ?? null, isEstimate: false };
}

export default {
  id: "ashby",
  name: "Ashby",
  probe: {
    url: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    extract: extractRawJobs,
  },
  fetchJobs: (slug) =>
    fetchBoardJobs(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`, extractRawJobs),
  rawId: (raw) => raw.id,
  normalize: (raw, company) => ({
    source: "ashby",
    company: { id: company.id, name: company.name, domain: company.domain },
    title: raw.title ?? "",
    location: raw.location ?? null,
    workMode: raw.workplaceType ? raw.workplaceType.toLowerCase() : raw.isRemote ? "remote" : null,
    postedAt: raw.publishedAt ?? null,
    postedAtKind: raw.publishedAt ? "posted" : "found",
    applyUrl: raw.applyUrl ?? raw.jobUrl ?? null,
    descriptionText: raw.descriptionPlain ?? "",
    descriptionHtml: sanitizeDescriptionHtml(raw.descriptionHtml ?? ""),
    compensation: normalizeAshbyCompensation(raw.compensation),
  }),
};

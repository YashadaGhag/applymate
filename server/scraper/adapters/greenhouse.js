import { sanitizeDescriptionHtml } from "../sanitizeDescription.js";
import { decodeHtmlEntities, htmlToPlainText } from "./text.js";
import { fetchBoardJobs, fetchWithTimeout, normalizeCompanyName, TIMEOUT_MS } from "./http.js";

// Greenhouse public job board (an ATS adapter). Response shapes verified by hand:
// - /jobs: 404 -> {"status":404,"error":"Job not found"}; valid board -> 200 {"jobs":[...]}
// - board metadata (/v1/boards/{slug}, no /jobs): 404 -> {"status":404,"error":"Job board not found"};
//   valid board -> 200 {"name":"Stripe","content":"..."}; used only to verify a jobs-endpoint match
//   is the right company.
// - /jobs?content=true: first_published is a genuine posted date; content is HTML (entity-encoded) and
//   has no structured pay field at all, so compensation is always null here.

const extractRawJobs = (data) => (Array.isArray(data?.jobs) ? data.jobs : null);

export default {
  id: "greenhouse",
  name: "Greenhouse",

  // Found by probing slug candidates (see detect.js).
  probe: {
    url: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    extract: extractRawJobs,
    /**
     * A jobs-endpoint match is checked against the board's display name before it is trusted: it
     * guards against a guessed slug that happens to be someone else's board.
     * Returns { outcome: "match" | "mismatch" | "error", url, ... }.
     */
    async verifyName(slug, companyName) {
      const url = `https://boards-api.greenhouse.io/v1/boards/${slug}`;
      let response;
      try {
        response = await fetchWithTimeout(url, TIMEOUT_MS);
      } catch (err) {
        return { outcome: "error", url, detail: err.name === "AbortError" ? "timeout" : err.message };
      }

      if (response.status === 404) {
        return { outcome: "error", url, httpStatus: 404, detail: "board metadata missing despite jobs endpoint match" };
      }
      if (!response.ok) {
        return { outcome: "error", url, httpStatus: response.status, detail: `unexpected status ${response.status}` };
      }

      let data;
      try {
        data = await response.json();
      } catch (err) {
        return { outcome: "error", url, httpStatus: response.status, detail: `invalid JSON: ${err.message}` };
      }

      const boardName = typeof data?.name === "string" ? data.name : null;
      if (!boardName) {
        return { outcome: "error", url, httpStatus: response.status, detail: "board metadata missing a name field" };
      }

      const matches = normalizeCompanyName(boardName) === normalizeCompanyName(companyName);
      return { outcome: matches ? "match" : "mismatch", url, httpStatus: response.status, boardName };
    },
  },

  fetchJobs: (slug) => fetchBoardJobs(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, extractRawJobs),

  // Job id: <companyId>:<rawId> (the registry default).
  rawId: (raw) => raw.id,

  normalize: (raw, company) => ({
    source: "greenhouse",
    company: { id: company.id, name: company.name, domain: company.domain },
    title: raw.title ?? "",
    location: raw.location?.name ?? null,
    workMode: null,
    postedAt: raw.first_published ?? raw.updated_at ?? null,
    postedAtKind: raw.first_published ? "posted" : raw.updated_at ? "updated" : "found",
    applyUrl: raw.absolute_url ?? null,
    descriptionText: htmlToPlainText(raw.content),
    descriptionHtml: sanitizeDescriptionHtml(decodeHtmlEntities(raw.content ?? "")),
    compensation: null,
  }),
};

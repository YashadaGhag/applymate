import { sanitizeDescriptionHtml } from "../sanitizeDescription.js";
import { fetchBoardJobs } from "./http.js";

// Lever public postings (an ATS adapter). Response shapes verified by hand: 404 ->
// {"ok":false,"error":"Document not found"}; valid board -> 200 with a bare JSON array (can be []).
// createdAt is epoch-ms; text is the title; descriptionPlain/openingPlain/additionalPlain are already
// plain text; salaryRange is a real field but empty on every live board checked.

const url = (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`;
const extractRawJobs = (data) => (Array.isArray(data) ? data : null);

// Lever's "lists" are separate labeled sections (e.g. "Requirements") that don't appear in
// descriptionPlain/description at all, so each gets its own heading and the structure survives.
function buildLeverDescriptionHtml(raw) {
  const listsHtml = (raw.lists ?? [])
    .map((list) => `<h3>${list.text ?? ""}</h3>${list.content ?? ""}`)
    .join("");
  return [raw.opening, raw.description, listsHtml, raw.additional].filter(Boolean).join("");
}

// Only maps Lever's own structured salaryRange object, never derived from description text.
function normalizeLeverCompensation(salaryRange) {
  if (!salaryRange || typeof salaryRange !== "object") return null;
  const { min, max, currency } = salaryRange;
  if (typeof min !== "number" && typeof max !== "number") return null;
  return { min: min ?? null, max: max ?? null, currency: currency ?? null, isEstimate: false };
}

export default {
  id: "lever",
  name: "Lever",
  probe: { url, extract: extractRawJobs },
  fetchJobs: (slug) => fetchBoardJobs(url(slug), extractRawJobs),
  rawId: (raw) => raw.id,
  normalize: (raw, company) => {
    const postedAtMs = typeof raw.createdAt === "number" ? raw.createdAt : null;
    return {
      source: "lever",
      company: { id: company.id, name: company.name, domain: company.domain },
      title: raw.text ?? "",
      location: raw.categories?.location ?? null,
      workMode: raw.workplaceType ? raw.workplaceType.toLowerCase() : null,
      postedAt: postedAtMs ? new Date(postedAtMs).toISOString() : null,
      postedAtKind: postedAtMs ? "posted" : "found",
      applyUrl: raw.applyUrl ?? raw.hostedUrl ?? null,
      descriptionText: [raw.openingPlain, raw.descriptionPlain, raw.additionalPlain].filter(Boolean).join("\n\n"),
      descriptionHtml: sanitizeDescriptionHtml(buildLeverDescriptionHtml(raw)),
      compensation: normalizeLeverCompensation(raw.salaryRange),
    };
  },
};

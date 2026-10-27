import { getCoverLettersStore, getJobsStore, getState } from "../store/store.js";
import { getSavedDraft } from "../ai/runTailoring.js";
import { getEdited } from "../edited/editedDocuments.js";
import { sanitizeEditedHtml } from "../edited/sanitizeEdited.js";
import { draftToHtml, letterToHtml } from "../../shared/resumeHtml.js";

// The two documents a job can have, by the tab names the saved-edit routes use.
export const DOCUMENT_TABS = { resume: "Resume", cover: "Cover Letter" };

/**
 * The file name Export PDF suggests: "{Name} - Resume - {Company}" (or "Cover Letter"), with the
 * characters a file name can't hold turned into spaces. A missing part is left out.
 */
export function buildFileName(name, label, company, extension = ".pdf") {
  const base = [name, label, company].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${base || label}${extension}`;
}

// The saved letter as blocks, in the shape letterToHtml takes (as the browser builds them).
function letterBlocks(letter) {
  return [
    { kind: "header", ...letter.header },
    { kind: "greeting", text: letter.greeting },
    ...letter.paragraphs.map((text) => ({ kind: "paragraph", text })),
    { kind: "signoff", ...letter.signoff },
  ];
}

const latestLetter = (jobId) => {
  const store = getCoverLettersStore();
  return store.letters[store.latestByJob[jobId]] ?? null;
};

/**
 * The document to print for a job and tab, or a reason it can't be:
 *   { error: "job_not_found" | "no_document" } or
 *   { html, name, label, company, fileName, edited }
 * html is the saved edit when one exists for the current draft or letter (sanitized when it was
 * saved), else the generated draft or letter built with the same escaping builders the editor uses
 * (draftToHtml, letterToHtml). Never makes a call.
 */
export function loadDocument(jobId, tab) {
  const label = DOCUMENT_TABS[tab];
  if (!label) return { error: "bad_tab" };
  const job = getJobsStore().jobs.find((j) => j.id === jobId);
  if (!job) return { error: "job_not_found" };

  // The generated header links the websites in the profile (never a saved edit, which is used as saved).
  // The links go through the same sanitizer as a saved edit before they are printed.
  const websites = getState().profile?.websites;
  let generatedHtml;
  let name;
  let company = job.company?.name ?? null;
  if (tab === "resume") {
    const { draft } = getSavedDraft(jobId);
    if (!draft) return { error: "no_document" };
    generatedHtml = () => sanitizeEditedHtml(draftToHtml(draft.blocks, { websites }));
    name = draft.blocks.find((b) => b.kind === "header")?.name ?? null;
    company = company ?? draft.job?.company ?? null;
  } else {
    const letter = latestLetter(jobId);
    if (!letter) return { error: "no_document" };
    generatedHtml = () => sanitizeEditedHtml(letterToHtml(letterBlocks(letter), { websites }));
    name = letter.header?.name ?? null;
    company = company ?? letter.job?.company ?? null;
  }

  const edited = getEdited(jobId, tab);
  return {
    html: edited ? edited.html : generatedHtml(),
    name,
    label,
    company,
    fileName: buildFileName(name, label, company),
    edited: Boolean(edited),
  };
}

/** The documents that exist for a job, Resume first: [{ tab, label, fileName }]. GET checks only. */
export function listDocuments(jobId) {
  return Object.keys(DOCUMENT_TABS)
    .map((tab) => ({ tab, doc: loadDocument(jobId, tab) }))
    .filter(({ doc }) => !doc.error)
    .map(({ tab, doc }) => ({ tab, label: doc.label, fileName: doc.fileName }));
}

// Origins the PDF route will open: this machine only. It never fetches a URL the client supplies
// otherwise.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True for an http(s) origin on localhost, 127.0.0.1 or [::1] (any port), with nothing else in it. */
export function isAllowedOrigin(origin) {
  if (typeof origin !== "string") return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (!LOCAL_HOSTS.has(url.hostname)) return false;
  return url.origin === origin;
}

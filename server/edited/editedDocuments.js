import { getCoverLettersStore, getEditedDocumentsStore, updateEditedDocumentsStore } from "../store/store.js";
import { draftKey, getSavedDraft } from "../ai/runTailoring.js";
import { editedHtmlToText } from "./htmlToText.js";

export const TABS = ["resume", "cover"];

/**
 * The key of the draft or letter a tab's edit attaches to, or null when there is none:
 *  - resume: the saved tailored draft for this job and the CURRENT resume (job + resume version +
 *    TAILORING_VERSION). After Replace resume there is no draft for the new version until one is
 *    generated, so an edit saved for the old draft stays with the old key and a new draft starts clean.
 *  - cover: the key of the job's most recent letter.
 */
export function targetKey(jobId, tab) {
  if (tab === "resume") {
    const { draft } = getSavedDraft(jobId);
    return draft ? draftKey(jobId, draft.resumeVersion) : null;
  }
  if (tab === "cover") {
    const store = getCoverLettersStore();
    return store.letters[store.latestByJob[jobId]]?.key ?? null;
  }
  return null;
}

/** One saved version per job + tab + draft/letter key. */
export function editKey(jobId, tab, target) {
  return `${jobId}|${tab}|${target}`;
}

/** { html, savedAt } for the current draft or letter, or null. Never makes a call. */
export function getEdited(jobId, tab) {
  const target = targetKey(jobId, tab);
  if (!target) return null;
  return getEditedDocumentsStore().edits[editKey(jobId, tab, target)] ?? null;
}

/** Saves (overwrites) the sanitized HTML for the current draft or letter. Null when there is none. */
export function saveEdited(jobId, tab, html) {
  const target = targetKey(jobId, tab);
  if (!target) return null;
  const edited = { html, savedAt: new Date().toISOString() };
  updateEditedDocumentsStore((s) => ({ ...s, edits: { ...s.edits, [editKey(jobId, tab, target)]: edited } }));
  return edited;
}

/**
 * The saved edited resume for this job as plain text (derived here, from the stored sanitized HTML,
 * never from text sent by the browser), with its HTML; null when none is saved or it has no text.
 * The cover letter's first-choice resume source. Only the SAVED version: unsaved edits never get here.
 */
export function getSavedEditedResume(jobId) {
  const edited = getEdited(jobId, "resume");
  if (!edited) return null;
  const text = editedHtmlToText(edited.html);
  return text ? { text, html: edited.html, savedAt: edited.savedAt } : null;
}

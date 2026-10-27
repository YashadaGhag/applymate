import { Router } from "express";
import { DOCUMENT_TABS, isAllowedOrigin, listDocuments, loadDocument } from "../pdf/documents.js";
import { PdfError, generatePdf } from "../pdf/generate.js";

const router = Router();

function documentOrReply(req, res) {
  const doc = loadDocument(req.params.id, req.query.tab);
  if (doc.error === "bad_tab") res.status(400).json({ error: "bad_tab", message: "tab must be resume or cover." });
  else if (doc.error === "job_not_found") res.status(404).json({ error: "not_found", message: "No job with that id." });
  else if (doc.error === "no_document") res.status(404).json({ error: "no_document", message: "There is no saved document to download." });
  else return doc;
  return null;
}

/**
 * GET /api/jobs/:id/documents
 * { documents: [{ tab: "resume" | "cover", label, fileName }] }: the documents that exist for the
 * job, Resume first (the saved tailored resume for the current resume version, and/or the saved
 * cover letter). The Download Files panel on Job Details. Never makes a call. 404 unknown job.
 */
router.get("/jobs/:id/documents", (req, res) => {
  const first = loadDocument(req.params.id, "resume");
  if (first.error === "job_not_found") return res.status(404).json({ error: "not_found" });
  res.json({ documents: listDocuments(req.params.id) });
});

/**
 * GET /api/jobs/:id/document?tab=resume|cover
 * { html, name, label, fileName } for the print page: the saved edit (sanitized when it was saved) if
 * one exists for the current draft or letter, else the generated one built with the escaping
 * builders. 400 bad tab; 404 unknown job or no document.
 */
router.get("/jobs/:id/document", (req, res) => {
  const doc = documentOrReply(req, res);
  if (!doc) return;
  const { html, name, label, fileName } = doc;
  res.json({ html, name, label, fileName });
});

// "Name - Resume - Company.pdf" as a header: a plain ASCII fallback plus the UTF-8 form.
function contentDisposition(fileName) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * GET /api/jobs/:id/pdf?tab=resume|cover&origin=<the page's origin>
 * A PDF of that document, generated now with headless Chrome or Edge from the app's print page
 * (/print/:jobId/:tab on `origin`); nothing is stored. Sent as an attachment with the file name.
 * 400 bad tab or an origin that isn't localhost, 127.0.0.1 or [::1]; 404 unknown job or no document;
 * 500 with a short message when no Chrome or Edge is found or the PDF couldn't be made.
 */
router.get("/jobs/:id/pdf", async (req, res) => {
  const { tab, origin } = req.query;
  if (!DOCUMENT_TABS[tab]) return res.status(400).json({ error: "bad_tab", message: "tab must be resume or cover." });
  if (!isAllowedOrigin(origin)) return res.status(400).json({ error: "bad_origin", message: "That origin isn't allowed." });
  const doc = documentOrReply(req, res);
  if (!doc) return;

  try {
    const url = `${origin}/print/${encodeURIComponent(req.params.id)}/${tab}`;
    const pdf = await generatePdf(url);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", contentDisposition(doc.fileName));
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  } catch (err) {
    const message = err instanceof PdfError ? err.message : "The PDF couldn't be generated. Try again.";
    res.status(500).json({ error: "pdf_failed", message });
  }
});

export default router;

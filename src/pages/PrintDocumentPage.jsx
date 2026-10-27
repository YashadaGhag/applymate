import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ResumePrint } from "../components/ResumeEditor/ResumeEditor";
import { loadDocumentFonts } from "../components/ResumeEditor/fonts";

/**
 * The page the server's PDF download opens in headless Chrome or Edge (/print/:jobId/:tab, outside
 * MainLayout, never linked from the app). It fetches the document's HTML (the saved edit if there is
 * one, else the generated draft or letter: GET /api/jobs/:id/document, already sanitized or built
 * with escaping builders), renders it in the same print container Export PDF uses, loads the fonts
 * the document uses, then sets window.__printReady = true for the server to wait on (or
 * window.__printError = a short message). The page rules for the PDF are the print rules in
 * src/index.css, nothing here.
 */
export default function PrintDocumentPage() {
  const { jobId, tab } = useParams();
  const [doc, setDoc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/document?tab=${encodeURIComponent(tab)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "The document couldn't be loaded.");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setDoc(data);
      })
      .catch((err) => {
        window.__printError = err.message;
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, tab]);

  useEffect(() => {
    if (!doc) return undefined;
    let cancelled = false;
    // The file name is the page title (what a browser suggests when saving).
    document.title = doc.fileName.replace(/\.pdf$/i, "");
    loadDocumentFonts(doc.html).then(() => {
      // Two frames, so the document has been painted before the server prints it.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) window.__printReady = true;
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  return doc ? <ResumePrint html={doc.html} /> : null;
}

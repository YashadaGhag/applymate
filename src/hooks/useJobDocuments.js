import { useEffect, useState } from "react";

/**
 * The documents that exist for a job (GET /api/jobs/:id/documents, never a call): the saved
 * tailored resume for the current resume version and/or the saved cover letter, Resume first, each
 * { tab: "resume" | "cover", label, fileName }. Empty while loading or if the read fails: the
 * Download Files panel then simply isn't shown.
 */
export function useJobDocuments(jobId) {
  const [result, setResult] = useState({ forId: null, documents: [] });

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/documents`)
      .then((res) => (res.ok ? res.json() : { documents: [] }))
      .catch(() => ({ documents: [] }))
      .then((data) => {
        if (!cancelled) setResult({ forId: jobId, documents: data.documents ?? [] });
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return result.forId === jobId ? result.documents : [];
}

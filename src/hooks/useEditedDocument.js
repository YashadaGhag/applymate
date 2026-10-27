import { useCallback, useEffect, useState } from "react";

/**
 * The saved edit of one tab's document (GET/PUT /api/jobs/:id/edited), for the CURRENT draft or
 * letter. Read once the document is at Ready; a GET, never a call of any kind.
 *   tab: "resume" | "cover"
 *   enabled: true once the draft or letter exists. A document that was just generated in this visit
 *            (`skipRead`) is new, so it can't have an edit: no read.
 *   status: "idle" (not enabled) | "loading" | "ready". A failed read counts as "no saved edit".
 *   saved: { html, savedAt } | null
 *   save(html): PUTs the edited HTML. Resolves to the saved { html, savedAt } (the SANITIZED copy the
 *   server stored) or throws; nothing changes locally on a failure.
 */
export function useEditedDocument(jobId, tab, { enabled, skipRead = false }) {
  const [loaded, setLoaded] = useState({ key: null, saved: null });
  const key = `${jobId}|${tab}`;

  useEffect(() => {
    if (!enabled || skipRead || !jobId) return undefined;
    let cancelled = false;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/edited?tab=${tab}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        if (!cancelled) setLoaded({ key, saved: data?.edited ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, skipRead, jobId, tab, key]);

  const save = useCallback(
    async (html) => {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/edited`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, html }),
      });
      if (!res.ok) throw new Error(`save responded ${res.status}`);
      const { edited } = await res.json();
      setLoaded({ key, saved: edited });
      return edited;
    },
    [jobId, tab, key]
  );

  if (!enabled) return { status: "idle", saved: null, save };
  if (skipRead) return { status: "ready", saved: loaded.key === key ? loaded.saved : null, save };
  if (loaded.key !== key) return { status: "loading", saved: null, save };
  return { status: "ready", saved: loaded.saved, save };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useJobActions } from "../context/JobActionsContext";

const APPLY_FAILED_MESSAGE = "Couldn't save this application. Try again.";
const MARK_FAILED_MESSAGE = "Couldn't mark this job as applied. Try again.";
const REVERT_FAILED_MESSAGE = "Couldn't revert this application. Try again.";

async function send(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return (await res.json()).application;
}

/**
 * "Apply now": opens the posting in a new tab first, synchronously inside the click so the browser
 * doesn't block it as a popup, then saves the pending application. Resolves to the saved
 * application, or null when the save failed (an error toast is shown and nothing else changes).
 * The posting stays open either way: it was already opened.
 */
export function useApplyNow() {
  const { showError } = useJobActions();
  return useCallback(
    (job) => {
      if (job.applyUrl) window.open(job.applyUrl, "_blank", "noopener,noreferrer");
      return send("POST", `/api/applications/${encodeURIComponent(job.id)}/pending`).catch((err) => {
        console.warn("[applications] couldn't save the pending application:", err);
        showError(APPLY_FAILED_MESSAGE);
        return null;
      });
    },
    [showError]
  );
}

/**
 * Job Details' application state, always from the server: the job's application record (or null)
 * and whether a saved tailored draft exists for the current resume (a GET, never a call).
 *   status: "loading" | "ready". A failed read counts as "no record, no draft": the pending save is
 *   idempotent, so showing the first state can't create a duplicate or reset anything.
 */
export function useApplication(job) {
  const jobId = job?.id;
  const applyNow = useApplyNow();
  const { showError } = useJobActions();
  const [loaded, setLoaded] = useState({ forId: null, application: null, hasDraft: false });
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    const id = encodeURIComponent(jobId);
    const read = (path) => fetch(path).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    Promise.all([read(`/api/applications/${id}`), read(`/api/jobs/${id}/tailoring`)]).then(([app, tailoring]) => {
      if (cancelled) return;
      setLoaded({ forId: jobId, application: app?.application ?? null, hasDraft: Boolean(tailoring?.tailoring) });
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const setApplication = (application) =>
    setLoaded((prev) => (prev.forId === jobId ? { ...prev, application } : prev));

  // Apply now: on a save failure the state stays as it was.
  const apply = async () => {
    const application = await applyNow(job);
    if (application && isMounted.current) setApplication(application);
  };

  // Mark as applied: resolves true on success. On failure an error toast, the state unchanged.
  const markApplied = async () => {
    try {
      const application = await send("PUT", `/api/applications/${encodeURIComponent(jobId)}/status`, { status: "applied" });
      if (isMounted.current) setApplication(application);
      return true;
    } catch (err) {
      console.warn("[applications] couldn't mark as applied:", err);
      showError(MARK_FAILED_MESSAGE);
      return false;
    }
  };

  // Revert to application pending (applied only; the server refuses any other status with a 409):
  // the same status route the Tracker uses. Resolves true on success. On failure an error toast,
  // the record stays applied.
  const revertToPending = async () => {
    try {
      const application = await send("PUT", `/api/applications/${encodeURIComponent(jobId)}/status`, { status: "pending" });
      if (isMounted.current) setApplication(application);
      return true;
    } catch (err) {
      console.warn("[applications] couldn't revert to pending:", err);
      showError(REVERT_FAILED_MESSAGE);
      return false;
    }
  };

  const ready = Boolean(jobId) && loaded.forId === jobId;
  return {
    status: ready ? "ready" : "loading",
    application: ready ? loaded.application : null,
    hasDraft: ready ? loaded.hasDraft : false,
    apply,
    markApplied,
    revertToPending,
  };
}

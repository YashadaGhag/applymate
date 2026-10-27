import { useCallback, useEffect, useState } from "react";
import { useJobActions } from "../context/JobActionsContext";

const CHANGE_FAILED_MESSAGE = "Couldn't update this application. Try again.";

async function put(path, body) {
  const res = await fetch(path, {
    method: "PUT",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return (await res.json()).application;
}

/**
 * The Application Tracker's records from GET /api/applications (newest first).
 *   status: "loading" | "ready" | "error"
 *   changeStatus(jobId, status) / archive(jobId): the server decides; a row changes only after it
 *   confirms. On failure the shared error toast shows and the row stays as it was.
 */
export function useApplications() {
  const { showError } = useJobActions();
  const [state, setState] = useState({ status: "loading", applications: [] });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/applications")
      .then((res) => {
        if (!res.ok) throw new Error(`unexpected status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", applications: data.applications ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", applications: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const replace = useCallback((record) => {
    setState((prev) => ({ ...prev, applications: prev.applications.map((a) => (a.jobId === record.jobId ? record : a)) }));
  }, []);

  const change = useCallback(
    async (path, body) => {
      try {
        replace(await put(path, body));
        return true;
      } catch (err) {
        console.warn("[applications] change failed:", err);
        showError(CHANGE_FAILED_MESSAGE);
        return false;
      }
    },
    [replace, showError]
  );

  const changeStatus = useCallback(
    (jobId, status) => change(`/api/applications/${encodeURIComponent(jobId)}/status`, { status }),
    [change]
  );
  const archive = useCallback((jobId) => change(`/api/applications/${encodeURIComponent(jobId)}/archive`), [change]);

  return { status: state.status, applications: state.applications, changeStatus, archive };
}

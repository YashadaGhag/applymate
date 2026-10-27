import { useEffect, useState } from "react";

/**
 * Single-job lookup for JobDetailPage — the only place a job's full description is fetched.
 * /api/jobs (useJobs) never includes it, by design, so a job detail always needs its own request.
 *
 * status: "loading" | "ready" | "not_found" | "error". "not_found" covers both an unknown id and
 * a 404 response; the page shows the same "job not found" state either way. A closed-but-known
 * job still resolves to "ready" with job.closed === true — the page decides how to render that.
 *
 * Result is keyed by the jobId it was fetched for (`forId`), so "loading" is derived at render
 * time instead of reset via a synchronous setState at the start of the effect.
 */
export function useJob(jobId) {
  const [result, setResult] = useState({ job: null, status: "loading", forId: null });

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
      .then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`unexpected status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setResult({ job: data, status: data ? "ready" : "not_found", forId: jobId });
      })
      .catch(() => {
        if (!cancelled) setResult({ job: null, status: "error", forId: jobId });
      });

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (!jobId) return { job: null, status: "not_found" };
  if (result.forId !== jobId) return { job: null, status: "loading" };
  return { job: result.job, status: result.status };
}

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 5000;

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * "Refresh" after a Details edit (server/ai/refreshScores.js), for Job Recommendations:
 * GET /api/scoring/refresh on mount, then every 5 seconds only while the state is "running". Plain
 * GETs: they make no AI call. Whether the banner shows comes from the server, so it survives a reload.
 *
 * Returned: { status } (null until loaded, then { state: "none" | "ready" | "running" | "failed",
 * needed, startedAt, finishedAt, calls, message }), start() (POST /api/scoring/refresh/start, the
 * Refresh / Try again click; resolves { ok, error? } and shows "running" at once on success) and
 * starting. onFinished(state) runs when a run this hook watched ends ("none" = done, or "failed").
 */
export function useScoreRefresh({ onFinished } = {}) {
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const mounted = useRef(true);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  const read = useCallback(async () => {
    try {
      const res = await fetch("/api/scoring/refresh");
      if (!res.ok) throw new Error(`/api/scoring/refresh responded ${res.status}`);
      const next = await res.json();
      if (mounted.current) setStatus(next);
      return next;
    } catch (err) {
      console.warn("[refresh scores] could not read the status:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetch("/api/scoring/refresh")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`/api/scoring/refresh responded ${res.status}`))))
      .then((next) => mounted.current && setStatus(next))
      .catch((err) => console.warn("[refresh scores] could not read the status:", err));
    return () => {
      mounted.current = false;
    };
  }, []);

  const state = status?.state;
  useEffect(() => {
    if (state !== "running") return undefined;
    const timer = setInterval(async () => {
      const next = await read();
      if (next && next.state !== "running") onFinishedRef.current?.(next.state);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [state, read]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/scoring/refresh/start", { method: "POST" });
      const body = await readJson(res);
      if (!res.ok) {
        await read(); // the server's state wins (e.g. already running)
        return { ok: false, error: body.message ?? "Couldn't refresh your scores." };
      }
      if (mounted.current) {
        setStatus((s) => ({ ...(s ?? {}), state: "running", startedAt: body.startedAt ?? null, finishedAt: null, calls: 0, message: null }));
      }
      return { ok: true };
    } catch (err) {
      console.warn("[refresh scores] could not start:", err);
      return { ok: false, error: "Couldn't refresh your scores." };
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, [read]);

  return { status, start, starting };
}

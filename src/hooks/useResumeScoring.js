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
 * "Score new resume" (server/ai/replaceResume.js), for the Job Recommendations page and
 * Change Preferences > Resume: GET /api/resume/scoring on mount, then every 5 seconds only while
 * the state is "running" (stops on anything else, and on unmount). Polling is a plain GET: it
 * never makes an AI call.
 *
 * Returned:
 *   status         null until loaded, then { state: "none" | "ready" | "running" | "failed" | "done",
 *                  fileName, startedAt, finishedAt, calls, modalSeen, doneSeen }
 *   refresh()      read the status again
 *   start()        POST /api/resume/scoring/start (the "Score now" / "Try again" click); resolves
 *                  { ok, error? } and shows "running" at once on success
 *   starting       the start request is on its way
 *   markModalSeen()  PUT the flag; the local copy updates at once
 *   markDoneSeen()   PUT the flag; the local copy stays as it is (see below)
 * onFinished(state) runs when a run this hook watched ends ("done" or "failed").
 */
export function useResumeScoring({ onFinished } = {}) {
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const mounted = useRef(true);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/resume/scoring");
      if (!res.ok) throw new Error(`/api/resume/scoring responded ${res.status}`);
      const next = await res.json();
      if (mounted.current) setStatus(next);
      return next;
    } catch (err) {
      console.warn("[scoring] could not read the status:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetch("/api/resume/scoring")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`/api/resume/scoring responded ${res.status}`))))
      .then((next) => mounted.current && setStatus(next))
      .catch((err) => console.warn("[scoring] could not read the status:", err));
    return () => {
      mounted.current = false;
    };
  }, []);

  // Poll only while running; tell the page when a run it watched ends.
  const state = status?.state;
  useEffect(() => {
    if (state !== "running") return undefined;
    const timer = setInterval(async () => {
      const next = await refresh();
      if (next && next.state !== "running" && ["done", "failed"].includes(next.state)) {
        onFinishedRef.current?.(next.state);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [state, refresh]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/resume/scoring/start", { method: "POST" });
      const body = await readJson(res);
      if (!res.ok) {
        await refresh(); // the server's state wins (e.g. already running)
        return { ok: false, error: body.message ?? "Couldn't start scoring." };
      }
      if (mounted.current) {
        setStatus((s) => ({ ...(s ?? {}), state: "running", startedAt: body.startedAt ?? null, finishedAt: null, calls: 0 }));
      }
      return { ok: true };
    } catch (err) {
      console.warn("[scoring] could not start:", err);
      return { ok: false, error: "Couldn't start scoring." };
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, [refresh]);

  const putFlag = useCallback(async (path, key, updateLocal) => {
    if (updateLocal) setStatus((s) => (s ? { ...s, [key]: true } : s));
    try {
      await fetch(`/api/resume/scoring/${path}`, { method: "PUT" });
    } catch (err) {
      console.warn(`[scoring] could not save ${key}:`, err);
    }
  }, []);

  const markModalSeen = useCallback(() => putFlag("modal-seen", "modalSeen", true), [putFlag]);
  // Saved on the server only: the local copy keeps doneSeen false, so a page showing the success
  // banner keeps it until the person leaves; the next visit reads true.
  const markDoneSeen = useCallback(() => putFlag("done-seen", "doneSeen", false), [putFlag]);

  return { status, refresh, start, starting, markModalSeen, markDoneSeen };
}

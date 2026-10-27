import { useCallback, useEffect, useState } from "react";

async function readProfile() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`/api/state responded ${res.status}`);
  const state = await res.json();
  return state.profile && typeof state.profile === "object" ? state.profile : {};
}

/**
 * The saved profile (Change Preferences > Details). Read from the server (GET /api/state), never
 * from OnboardingContext, which is empty after a refresh.
 *
 * `profile` is null until loaded; `status` is "loading" | "ready" | "error".
 *
 * save(patch) changes only the fields in `patch`. PUT /api/profile REPLACES the whole stored
 * profile with its body, so the patch is merged into a fresh copy read from the server right
 * before the write: resumeVersion, relocation, work authorization, websites, work modes and
 * every other field not in the patch are sent back unchanged. Resolves { ok: true } or
 * { ok: false, error }; never throws. No AI call, no rescoring: lists filter live from the saved
 * profile on every request.
 */
export function useProfile() {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    readProfile()
      .then((saved) => {
        if (cancelled) return;
        setProfile(saved);
        setStatus("ready");
      })
      .catch((err) => {
        console.warn("[profile] could not load the saved profile:", err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reads the profile again (after something else changed it, like a resume replacement).
  const reload = useCallback(async () => {
    try {
      setProfile(await readProfile());
    } catch (err) {
      console.warn("[profile] could not reload the saved profile:", err);
    }
  }, []);

  const save = useCallback(async (patch) => {
    try {
      const fresh = await readProfile();
      const merged = { ...fresh, ...patch };
      // ?edit=details tells the server this is a Details edit, so it can note that scores may be out of
      // date (the Job Recommendations Refresh banner). Nothing is rescored by the save itself.
      const res = await fetch("/api/profile?edit=details", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      if (!res.ok) throw new Error(`/api/profile responded ${res.status}`);
      const data = await res.json();
      setProfile(data.profile ?? merged);
      return { ok: true };
    } catch (err) {
      console.warn("[profile] could not save:", err);
      return { ok: false, error: "Couldn't save your preferences. Try again." };
    }
  }, []);

  return { profile, status, save, reload };
}

import { useCallback, useEffect, useState } from "react";

// Same limit as the server (server/routes/writingStyle.js).
export const TONE_MAX_CHARS = 1000;

// The file as base64, without the "data:...;base64," prefix.
function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file."));
    reader.readAsDataURL(file);
  });
}

/**
 * The cover-letter writing style (Change Preferences > Cover Letter).
 * style: { tone, letter: { fileName, summarizedAt, downloadable } | null, isSet, updatedAt } once
 * loaded. The saved letter file downloads from GET /api/writing-style/letter when downloadable.
 * isSet says whether cover letters will use a style (for the cover letter's "Will use" panel).
 * Loading only reads; the one AI call happens on save, and only for a newly attached letter.
 * reload() reads it again (also only a GET).
 *
 * save({ tone, letter }) where letter is "keep", "remove" or a File to replace it with.
 * Resolves { ok: true } or { ok: false, error } (never throws); the server saves all or nothing.
 */
export function useWritingStyle() {
  const [style, setStyle] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    fetch("/api/writing-style")
      .then((res) => {
        if (!res.ok) throw new Error(`/api/writing-style responded ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setStyle(data);
        setStatus("ready");
      })
      .catch((err) => {
        console.warn("[writing-style] couldn't load:", err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reads the saved style again (a GET, never a call), e.g. after it was changed in another
  // browser tab. Keeps what's shown until the answer arrives; a failed read keeps it as is.
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/writing-style");
      if (!res.ok) throw new Error(`/api/writing-style responded ${res.status}`);
      setStyle(await res.json());
      setStatus("ready");
    } catch (err) {
      console.warn("[writing-style] couldn't reload:", err);
    }
  }, []);

  const save = useCallback(async ({ tone, letter }) => {
    try {
      const letterBody =
        letter instanceof File
          ? { action: "replace", fileName: letter.name, data: await readAsBase64(letter) }
          : { action: letter };
      const res = await fetch("/api/writing-style", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone, letter: letterBody }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: data?.error ?? "Couldn't save your changes. Try again." };
      setStyle(data);
      return { ok: true };
    } catch (err) {
      console.warn("[writing-style] save failed:", err);
      return { ok: false, error: "Couldn't save your changes. Try again." };
    }
  }, []);

  return { style, status, isSet: Boolean(style?.isSet), save, reload };
}

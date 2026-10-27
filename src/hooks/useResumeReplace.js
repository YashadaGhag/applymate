import { useCallback, useEffect, useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// The latest uploaded resume's { fileName, hasFile, latestIsNew } from GET /api/state, or null:
// the new resume while it is ready, being scored or failed, otherwise the active one.
async function fetchResumeFile() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`/api/state responded ${res.status}`);
  const state = await res.json();
  return state.latestResume ?? null;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Change Preferences > Resume: the latest uploaded resume's name and the "Replace file" flow against
 * POST /api/resume/replace, POST /api/resume/replace/confirm and GET / DELETE /api/resume/replace
 * (server/ai/replaceResume.js). It ends when the new resume is "ready": scoring is a separate
 * click (useResumeScoring), so nothing here waits for a run.
 *
 * Returned:
 *   resumeFile    { fileName, hasFile, latestIsNew } | null: the LATEST uploaded resume (GET /api/state
 *                 → latestResume; its file is GET /api/resume/latest-file); null until loaded. Read
 *                 again after an upload, Confirm details, a discard, and when a run ends.
 *   reloadFile()  read it again
 *   busy          the spinner: uploading or saving Confirm details
 *   fileError     a wrong file type or size, for the helper line (nothing was sent)
 *   confirm       null, or { reasons, current, fromResume, fileName }: the Confirm details dialog
 *   toast         null, or { kind: "error" | "same" | "notice", message }
 *   chooseFile(file)            check the file, then upload it
 *   submitConfirm(profilePatch) POST confirm (resolves { ok, error? }); closes the dialog on success
 *   cancelConfirm()             DELETE the waiting new resume and close the dialog
 *   showNotice(message)         a plain toast (e.g. a start request the server refused)
 *   dismissToast()
 * onReady() runs when the new resume is waiting to be scored (the page re-reads the scoring status).
 */
export function useResumeReplace({ onReady } = {}) {
  const [resumeFile, setResumeFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const mounted = useRef(true);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  const loadFile = useCallback(async () => {
    try {
      const latest = await fetchResumeFile();
      if (mounted.current) setResumeFile(latest);
    } catch (err) {
      console.warn("[resume] could not load the resume file:", err);
    }
  }, []);

  const fail = useCallback(() => {
    if (!mounted.current) return;
    setBusy(false);
    setToast({ kind: "error", message: "File update failed" });
  }, []);

  const chooseFile = useCallback(
    async (file) => {
      const name = file.name.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
        setFileError("Unsupported file format. Please attach a PDF or DOCX.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileError("File exceeds 25MB limit.");
        return;
      }
      setFileError(null);
      setToast(null);
      setBusy(true);
      try {
        const res = await fetch("/api/resume/replace", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
          body: file,
        });
        if (!res.ok) return fail();
        const result = await res.json();
        if (!mounted.current) return;
        setBusy(false);
        if (result.status === "same_file") {
          setToast({ kind: "same", message: "That file is already your resume" });
          await loadFile(); // the server may have stored the original file just now
        } else if (result.status === "needs_confirmation") {
          setConfirm({ reasons: result.reasons ?? [], current: result.current, fromResume: result.fromResume, fileName: result.fileName });
        } else {
          await loadFile(); // the row now names the new file
          onReadyRef.current?.(); // ready: nothing to check, waits for "Score now"
        }
      } catch (err) {
        console.warn("[resume] upload failed:", err);
        fail();
      }
    },
    [fail, loadFile]
  );

  const submitConfirm = useCallback(async (profilePatch) => {
    const patch = profilePatch && Object.keys(profilePatch).length ? profilePatch : null;
    try {
      const res = await fetch("/api/resume/replace/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch ? { profilePatch: patch } : {}),
      });
      if (!res.ok) {
        const body = await readJson(res);
        return { ok: false, error: body.message ?? "Couldn't save your details." };
      }
    } catch (err) {
      console.warn("[resume] confirm failed:", err);
      return { ok: false, error: "Couldn't save your details." };
    }
    if (mounted.current) setConfirm(null);
    await loadFile(); // the row now names the new file
    onReadyRef.current?.();
    return { ok: true };
  }, [loadFile]);

  const cancelConfirm = useCallback(async () => {
    setConfirm(null);
    try {
      await fetch("/api/resume/replace", { method: "DELETE" });
    } catch (err) {
      console.warn("[resume] could not discard the new resume:", err);
    }
    await loadFile(); // back to the active resume
    onReadyRef.current?.(); // nothing is waiting any more: the page re-reads the status
  }, [loadFile]);

  // On opening the tab: the latest uploaded resume, and a Confirm details dialog an earlier visit left open.
  useEffect(() => {
    mounted.current = true;
    fetchResumeFile()
      .then((latest) => mounted.current && setResumeFile(latest))
      .catch((err) => console.warn("[resume] could not load the resume file:", err));
    fetch("/api/resume/replace")
      .then((res) => (res.ok ? res.json() : null))
      .then((status) => {
        if (mounted.current && status?.state === "needs_confirmation") {
          setConfirm({ reasons: status.reasons ?? [], current: status.current, fromResume: status.fromResume, fileName: status.fileName });
        }
      })
      .catch((err) => console.warn("[resume] could not read the replacement status:", err));
    return () => {
      mounted.current = false;
    };
  }, []);

  return {
    resumeFile,
    reloadFile: loadFile,
    busy,
    fileError,
    confirm,
    toast,
    chooseFile,
    submitConfirm,
    cancelConfirm,
    showNotice: (message) => setToast({ kind: "notice", message }),
    dismissToast: () => setToast(null),
  };
}

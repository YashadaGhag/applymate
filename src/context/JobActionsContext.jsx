import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Tooltip from '../components/Tooltip/Tooltip';
import Toast from '../components/Toast';

const TOAST_DURATION_MS = 5000;
const SAVED_MESSAGE = 'Job saved successfully';
const SAVE_FAILED_MESSAGE = "Couldn't save this job. Try again.";
const DISMISS_FAILED_MESSAGE = "Couldn't dismiss this job. Try again.";

// Safe default so a consumer outside <JobActionsProvider> (e.g. a Storybook story) reads
// "nothing saved or dismissed" instead of crashing.
const JobActionsContext = createContext({
  isSaved: () => false,
  isDismissed: () => false,
  toggleSave: () => {},
  dismiss: () => Promise.resolve(false),
  restore: () => {},
  showPendingDismissToast: () => {},
  showError: () => {},
  dismissedVersion: 0,
  // Outside the provider the one-time tip never shows.
  customizeTipSeen: true,
  markCustomizeTipSeen: () => {},
  downloadFilesTipSeen: true,
  markDownloadFilesTipSeen: () => {},
  markAppliedTipSeen: true,
  markMarkAppliedTipSeen: () => {},
});

const withId = (set, jobId, member) => {
  const next = new Set(set);
  if (member) next.add(jobId);
  else next.delete(jobId);
  return next;
};

function request(method, path) {
  return fetch(path, { method }).then((res) => {
    if (!res.ok) throw new Error(`${path} responded ${res.status}`);
    return res.json();
  });
}

/**
 * Saved and dismissed job ids, kept separate from the job records and stored on the server
 * (userState in data/store.json). Writes are optimistic: the UI changes at once and rolls back if
 * the server write fails. Dismissing also unsaves; UNDO restores both.
 *
 * Saving shows the success toast "Job saved successfully" once the server has the save (every place
 * that saves goes through toggleSave: cards and Job Details); a failed save shows the error toast with
 * RETRY, which saves again. Unsaving shows nothing, and a failed unsave rolls back silently.
 *
 * Also owns the one toast on screen (a new one replaces the old), so it survives navigation:
 * - Cards: dismiss(id) shows "Job posting dismissed" straight away.
 * - Job Details: dismiss(id, { deferToast: true }) resolves once the server confirms; the toast
 *   waits until the job list has loaded without that job (showPendingDismissToast). A failed
 *   write shows an error toast instead.
 */
export function JobActionsProvider({ children }) {
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  // Bumped after each dismiss/restore reaches the server, so the job list can refetch and the
  // next job takes a dismissed one's spot in the Others top 30.
  const [dismissedVersion, setDismissedVersion] = useState(0);
  // The one-time "Customizing resume…" tip (Job Recommendations): null until /api/state has loaded
  // (and if it can't be read), so it never flashes for someone who has already seen it.
  const [customizeTipSeen, setCustomizeTipSeen] = useState(null);
  // The two Job Details tips. null until /api/state is read (and for good if that read fails), so a tip never shows then.
  const [downloadFilesTipSeen, setDownloadFilesTipSeen] = useState(null);
  const [markAppliedTipSeen, setMarkAppliedTipSeen] = useState(null);
  // null | { kind: 'dismissed', jobId } | { kind: 'error', message } | { kind: 'saved' } | { kind: 'saveFailed', jobId }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  // Job Details dismissal confirmed by the server, toast not shown yet.
  const pendingToastJobId = useRef(null);
  // Whether each dismissed job was saved, so UNDO can save it again.
  const savedBeforeDismiss = useRef(new Map());
  // Latest write per list + job id. A rollback only applies if no newer write for that id has
  // happened since, so a failed save never undoes a later unsave.
  const writeSeq = useRef(new Map());
  // Writes made before /api/state has loaded, re-applied on top of the loaded lists.
  const pendingBeforeLoad = useRef([]);
  const hasLoaded = useRef(false);
  // Read inside callbacks without re-creating them on every change.
  const savedIdsRef = useRef(savedIds);
  const dismissedIdsRef = useRef(dismissedIds);
  useEffect(() => {
    savedIdsRef.current = savedIds;
    dismissedIdsRef.current = dismissedIds;
  }, [savedIds, dismissedIds]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/state')
      .then((res) => {
        if (!res.ok) throw new Error(`/api/state responded ${res.status}`);
        return res.json();
      })
      .then((state) => {
        if (cancelled) return;
        let saved = new Set(state.userState?.savedJobIds ?? []);
        let dismissed = new Set(state.userState?.dismissedJobIds ?? []);
        for (const { list, jobId, member } of pendingBeforeLoad.current) {
          if (list === 'saved') saved = withId(saved, jobId, member);
          else dismissed = withId(dismissed, jobId, member);
        }
        setSavedIds(saved);
        setDismissedIds(dismissed);
        setCustomizeTipSeen(Boolean(state.userState?.customizeTipSeenAt));
        setDownloadFilesTipSeen(Boolean(state.userState?.downloadFilesTipSeenAt));
        setMarkAppliedTipSeen(Boolean(state.userState?.markAppliedTipSeenAt));
      })
      .catch((err) => {
        console.warn('[job actions] could not load saved/dismissed jobs:', err);
      })
      .finally(() => {
        if (!cancelled) {
          hasLoaded.current = true;
          pendingBeforeLoad.current = [];
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // `persist`: no timer (the error toast with RETRY stays until it is used, like the watchlist's).
  const showToast = useCallback((next, { persist = false } = {}) => {
    clearTimeout(toastTimer.current);
    setToast(next);
    if (!persist) toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  const hideDismissedToast = useCallback((jobId) => {
    setToast((current) => (current?.kind === 'dismissed' && current.jobId === jobId ? null : current));
  }, []);

  // Applies `changes` ([{ list, member }]) for one job at once, sends the write, and rolls back
  // each change that's still the latest for its list if the write fails. Resolves to the server's
  // response, or null on failure.
  const applyWrite = useCallback((jobId, changes, method, path) => {
    const applied = changes.map(({ list, member }) => {
      const key = `${list}:${jobId}`;
      const seq = (writeSeq.current.get(key) ?? 0) + 1;
      writeSeq.current.set(key, seq);
      if (!hasLoaded.current) pendingBeforeLoad.current.push({ list, jobId, member });
      const setIds = list === 'saved' ? setSavedIds : setDismissedIds;
      const previous = (list === 'saved' ? savedIdsRef : dismissedIdsRef).current.has(jobId);
      setIds((prev) => withId(prev, jobId, member));
      return { key, seq, setIds, previous };
    });

    return request(method, path).catch((err) => {
      console.warn(`[job actions] ${method} ${path} failed, rolling back:`, err);
      for (const { key, seq, setIds, previous } of applied) {
        if (writeSeq.current.get(key) === seq) setIds((prev) => withId(prev, jobId, previous));
      }
      return null;
    });
  }, []);

  const setSaved = useCallback(
    (jobId, member) => {
      const path = `/api/user-state/saved/${encodeURIComponent(jobId)}`;
      // A "Job saved successfully" toast for this job would be stale the moment it is unsaved.
      if (!member) setToast((current) => (current?.kind === 'saved' ? null : current));
      applyWrite(jobId, [{ list: 'saved', member }], member ? 'PUT' : 'DELETE', path).then((res) => {
        if (!member) return; // unsaving shows nothing

        if (res) showToast({ kind: 'saved' });
        else showToast({ kind: 'saveFailed', jobId }, { persist: true });
      });
    },
    [applyWrite, showToast]
  );

  const toggleSave = useCallback((jobId) => setSaved(jobId, !savedIdsRef.current.has(jobId)), [setSaved]);

  // Resolves true once the server has the dismissal, false if the write failed.
  const dismiss = useCallback(
    (jobId, { deferToast = false } = {}) => {
      savedBeforeDismiss.current.set(jobId, savedIdsRef.current.has(jobId));
      if (deferToast) pendingToastJobId.current = null;
      else showToast({ kind: 'dismissed', jobId });

      const changes = [
        { list: 'dismissed', member: true },
        { list: 'saved', member: false },
      ];
      const path = `/api/user-state/dismissed/${encodeURIComponent(jobId)}`;
      return applyWrite(jobId, changes, 'PUT', path).then((res) => {
        if (!res) {
          if (deferToast) showToast({ kind: 'error', message: DISMISS_FAILED_MESSAGE });
          else hideDismissedToast(jobId);
          return false;
        }
        // The server knows best whether it was saved (a save may still have been in flight).
        savedBeforeDismiss.current.set(jobId, Boolean(res.wasSaved || savedBeforeDismiss.current.get(jobId)));
        if (deferToast) pendingToastJobId.current = jobId;
        setDismissedVersion((v) => v + 1);
        return true;
      });
    },
    [applyWrite, showToast, hideDismissedToast]
  );

  const restore = useCallback(
    (jobId) => {
      hideDismissedToast(jobId);
      const resave = Boolean(savedBeforeDismiss.current.get(jobId));
      const changes = [{ list: 'dismissed', member: false }];
      if (resave) changes.push({ list: 'saved', member: true });
      const path = `/api/user-state/dismissed/${encodeURIComponent(jobId)}${resave ? '?restoreSaved=true' : ''}`;
      applyWrite(jobId, changes, 'DELETE', path).then((res) => {
        if (!res) return;
        savedBeforeDismiss.current.delete(jobId);
        setDismissedVersion((v) => v + 1);
      });
    },
    [applyWrite, hideDismissedToast]
  );

  // Called by the job list once it has loaded. Shows the deferred toast for a Job Details
  // dismissal, but only when `isListed(jobId)` says the loaded list no longer has that job.
  const showPendingDismissToast = useCallback(
    (isListed) => {
      const jobId = pendingToastJobId.current;
      if (!jobId || isListed(jobId)) return;
      pendingToastJobId.current = null;
      showToast({ kind: 'dismissed', jobId });
    },
    [showToast]
  );

  // The tip was dismissed: hidden at once and for good (userState.customizeTipSeenAt). A failed
  // write only means it may show once more on a later visit.
  const markCustomizeTipSeen = useCallback(() => {
    setCustomizeTipSeen(true);
    fetch('/api/user-state/customize-tip-seen', { method: 'PUT' }).catch((err) => {
      console.warn('[job actions] could not save that the tip was seen:', err);
    });
  }, []);

  // The two Job Details tips: same rule, called only from "Got it".
  const markDownloadFilesTipSeen = useCallback(() => {
    setDownloadFilesTipSeen(true);
    fetch('/api/user-state/download-files-tip-seen', { method: 'PUT' }).catch((err) => {
      console.warn('[job actions] could not save that the Download Files tip was seen:', err);
    });
  }, []);
  const markMarkAppliedTipSeen = useCallback(() => {
    setMarkAppliedTipSeen(true);
    fetch('/api/user-state/mark-applied-tip-seen', { method: 'PUT' }).catch((err) => {
      console.warn('[job actions] could not save that the Mark as applied tip was seen:', err);
    });
  }, []);

  const value = {
    isSaved: (jobId) => savedIds.has(jobId),
    isDismissed: (jobId) => dismissedIds.has(jobId),
    toggleSave,
    dismiss,
    restore,
    showPendingDismissToast,
    // The shared error toast, for other flows that need one (the application flow).
    showError: (message) => showToast({ kind: 'error', message }),
    dismissedVersion,
    customizeTipSeen,
    markCustomizeTipSeen,
    downloadFilesTipSeen,
    markDownloadFilesTipSeen,
    markAppliedTipSeen,
    markMarkAppliedTipSeen,
  };

  const closeToast = useCallback(() => {
    clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  return (
    <JobActionsContext.Provider value={value}>
      {children}
      {/* No toast placement in Figma: simplest option, fixed bottom-center above page content. */}
      {toast?.kind === 'saved' && <Toast variant="success" message={SAVED_MESSAGE} onHide={closeToast} />}
      {toast?.kind === 'saveFailed' && (
        <Toast
          variant="error"
          message={SAVE_FAILED_MESSAGE}
          onHide={closeToast}
          onAction={() => {
            closeToast();
            setSaved(toast.jobId, true);
          }}
        />
      )}
      {toast && toast.kind !== 'saved' && toast.kind !== 'saveFailed' && (
        <div className="fixed inset-x-0 bottom-sp24 z-50 flex justify-center px-sp16">
          {toast.kind === 'dismissed' ? (
            <Tooltip
              variant="error"
              message="Job posting dismissed"
              actionLabel="UNDO"
              onAction={() => {
                closeToast();
                restore(toast.jobId);
              }}
            />
          ) : (
            // No Figma state for a failed dismiss: same toast, the action just closes it.
            <Tooltip variant="error" message={toast.message} actionLabel="Close" onAction={closeToast} />
          )}
        </div>
      )}
    </JobActionsContext.Provider>
  );
}

export const useJobActions = () => useContext(JobActionsContext);

import { useCallback, useEffect, useReducer, useRef } from "react";
import { readNdjson } from "../utils/ndjson";

/**
 * Tailored-resume state for one job (Customize Application, Resume tab).
 *
 * On load it only asks for a saved draft (GET /api/jobs/:id/tailoring, never a call):
 * - a saved draft → phase "done" straight away;
 * - a call already running (e.g. the page was refreshed mid-call) → POST, which joins that call
 *   on the server (replays what's been written so far, then follows) instead of starting another;
 * - otherwise → phase "idle", and the page shows a "Tailor my resume" button. Arriving from Job
 *   Details never starts a call.
 * `start()` is only ever called from a click (that button or "Try again").
 *
 * phase: "checking" | "idle" | "waiting" (POST sent, nothing streamed yet) | "streaming" |
 *        "done" | "error". "waiting" and "streaming" are both "running" to the page.
 * Everything below moves only on stream events, never on time:
 * - plan: the sections the model is about to write, in order ({ kind, section, title }), sent
 *   before any of them. Sizes the skeletons and the per-section progress shares.
 * - sectionsStarted: the first section has started (reading is over).
 * - currentIndex: the section being written now (block_start), or null between sections.
 * - blocks[]: sections as they complete, by index.
 * - blocksDone: every section is in; the gap list and the "nothing added" check are next.
 * - checked: the "nothing added" check has run (the last event before the saved draft).
 * live: the draft was written while this page watched (start to done), so its durationMs is a
 * real "tailored in" time and the Assistant shows its steps. A saved draft opened later, or one
 * the server returned already saved, is not live: it goes straight to Ready.
 */
const INITIAL = {
  phase: "checking",
  plan: null,
  sectionsStarted: false,
  currentIndex: null,
  blocks: [],
  blocksDone: false,
  checked: false,
  cached: false,
  live: false,
  gaps: null,
  changes: null,
  check: null,
  draft: null,
  error: null,
};

function reducer(state, event) {
  switch (event.type) {
    case "idle":
      return { ...INITIAL, phase: "idle" };
    case "waiting":
      return { ...INITIAL, phase: "waiting" };
    case "start":
      return { ...state, cached: Boolean(event.cached) };
    case "plan":
      return { ...state, phase: "streaming", plan: event.items };
    case "block_start":
      return { ...state, phase: "streaming", sectionsStarted: true, currentIndex: event.index };
    case "block": {
      const blocks = [...state.blocks];
      blocks[event.index] = event.block;
      return { ...state, blocks, currentIndex: state.currentIndex === event.index ? null : state.currentIndex };
    }
    case "blocks_done":
      return { ...state, blocksDone: true, currentIndex: null };
    case "gaps":
      return { ...state, gaps: event.items };
    case "changes":
      return { ...state, changes: event.items };
    case "check":
      return { ...state, checked: true, check: { verified: event.verified, newItems: event.newItems } };
    case "done": {
      const d = event.draft;
      const live = !state.cached && (state.phase === "waiting" || state.phase === "streaming");
      return {
        ...INITIAL,
        phase: "done",
        live,
        sectionsStarted: true,
        blocksDone: true,
        checked: true,
        draft: d,
        blocks: d.blocks,
        gaps: d.gaps,
        changes: d.changes,
        check: d.check,
      };
    }
    case "error":
      return { ...state, phase: "error", currentIndex: null, error: event.message };
    default:
      // "thinking" needs nothing: the Assistant is already on "Understand your experience" from
      // the click, and the model's reasoning itself is never sent.
      return state;
  }
}

const LOST_CONNECTION = "The connection to the tailoring call was lost. If it finished, Try again shows the saved draft.";

export function useTailoring(jobId) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const controllerRef = useRef(null);

  // POSTs and reads the NDJSON stream to its end. The server decides whether this starts the one
  // call, joins a running one, or returns the saved draft; it never starts a second call.
  const stream = useCallback(
    async (signal) => {
      dispatch({ type: "waiting" });
      let res;
      try {
        res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/tailor`, { method: "POST", signal });
      } catch {
        if (!signal.aborted) dispatch({ type: "error", message: "Couldn't reach ApplyMate's server. Check that it's running, then try again." });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        dispatch({ type: "error", message: body.message ?? "Tailoring couldn't start. Try again." });
        return;
      }

      const finished = await readNdjson(res, dispatch);
      if (!finished && !signal.aborted) dispatch({ type: "error", message: LOST_CONNECTION });
    },
    [jobId]
  );

  const run = useCallback(
    (work) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      work(controller.signal);
    },
    []
  );

  // Leaving the page only stops reading; the call itself keeps going on the server and its
  // draft is saved, so coming back shows it.
  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    run(async (signal) => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/tailoring`, { signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const { tailoring, inFlight } = await res.json();
        if (signal.aborted) return;
        if (tailoring) dispatch({ type: "done", draft: tailoring });
        else if (inFlight) await stream(signal);
        else dispatch({ type: "idle" });
      } catch {
        if (!signal.aborted) dispatch({ type: "error", message: "Couldn't check for a saved draft. Try again." });
      }
    });
  }, [jobId, run, stream]);

  const start = useCallback(() => run((signal) => stream(signal)), [run, stream]);

  return { ...state, start };
}

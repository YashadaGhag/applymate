import { useCallback, useEffect, useReducer, useRef } from "react";
import { readNdjson } from "../utils/ndjson";

/**
 * Cover letter state for one job (Customize Application, Cover Letter tab).
 *
 * On load it only asks for the job's latest letter (GET /api/jobs/:id/cover-letter, never a call):
 * - a saved letter → phase "done" straight away (no step animation);
 * - a call already running (e.g. the page was refreshed mid-call) → POST, which joins that call on
 *   the server instead of starting another;
 * - otherwise → phase "idle", and the tab shows "Generate cover letter".
 * generate() is only ever called from a click (that button or "Try again"). It sends nothing: the
 * server resolves the resume source by job id (the saved edited resume, else the saved tailored
 * draft, else the base resume), so unsaved edits in the browser never reach the letter.
 *
 * phase: "checking" | "idle" | "waiting" (POST sent, nothing streamed yet) | "streaming" |
 *        "done" | "error". Everything below moves only on stream events, never on time:
 * - blocks[]: by index: 0 header and 1 greeting (code, at once), 2… body paragraphs as each
 *   completes, then the sign-off (code).
 * - plan: { paragraphs, achievements } once the model has planned the body.
 * - paragraphsStarted: the first body paragraph has started (reading is over).
 * - currentIndex / currentKind: the block being written now (block_start), or null.
 * - blocksDone / checked: every block is in / the "nothing added" check has run.
 * live: written while this page watched; a saved letter opened later is not live.
 */
const INITIAL = {
  phase: "checking",
  plan: null,
  paragraphsStarted: false,
  currentIndex: null,
  currentKind: null,
  blocks: [],
  blocksDone: false,
  checked: false,
  cached: false,
  live: false,
  check: null,
  letter: null,
  error: null,
};

// The saved letter as blocks, in the same shape the stream sends them.
function letterBlocks(letter) {
  return [
    { kind: "header", ...letter.header },
    { kind: "greeting", text: letter.greeting },
    ...letter.paragraphs.map((text) => ({ kind: "paragraph", text })),
    { kind: "signoff", ...letter.signoff },
  ];
}

function reducer(state, event) {
  switch (event.type) {
    case "idle":
      return { ...INITIAL, phase: "idle" };
    case "waiting":
      return { ...INITIAL, phase: "waiting" };
    case "start":
      return { ...state, cached: Boolean(event.cached) };
    case "plan":
      return { ...state, phase: "streaming", plan: { paragraphs: event.paragraphs, achievements: event.achievements ?? [] } };
    case "block_start":
      return {
        ...state,
        phase: "streaming",
        paragraphsStarted: state.paragraphsStarted || event.kind === "paragraph",
        currentIndex: event.index,
        currentKind: event.kind,
      };
    case "block": {
      const blocks = [...state.blocks];
      blocks[event.index] = event.block;
      return state.currentIndex === event.index
        ? { ...state, blocks, currentIndex: null, currentKind: null }
        : { ...state, blocks };
    }
    case "blocks_done":
      return { ...state, blocksDone: true, currentIndex: null, currentKind: null };
    case "check":
      return { ...state, checked: true, check: { verified: event.verified, newItems: event.newItems } };
    case "done": {
      const { letter } = event;
      const live = !state.cached && (state.phase === "waiting" || state.phase === "streaming");
      return {
        ...INITIAL,
        phase: "done",
        live,
        paragraphsStarted: true,
        blocksDone: true,
        checked: true,
        plan: { paragraphs: letter.paragraphs.length, achievements: letter.achievements ?? [] },
        blocks: letterBlocks(letter),
        check: letter.check,
        letter,
      };
    }
    case "error":
      return { ...state, phase: "error", currentIndex: null, currentKind: null, error: event.message };
    default:
      // "thinking": the Assistant is already on "Understand the role" from the click.
      return state;
  }
}

const LOST_CONNECTION = "The connection to the cover letter call was lost. If it finished, Try again shows the saved letter.";

export function useCoverLetter(jobId) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const controllerRef = useRef(null);

  // POSTs and reads the NDJSON stream to its end. The server decides whether this starts the one
  // call, joins a running one, or returns a saved letter with the same inputs.
  const stream = useCallback(
    async (signal) => {
      dispatch({ type: "waiting" });
      let res;
      try {
        res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cover-letter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
        });
      } catch {
        if (!signal.aborted) dispatch({ type: "error", message: "Couldn't reach ApplyMate's server. Check that it's running, then try again." });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        dispatch({ type: "error", message: body.message ?? "The cover letter couldn't start. Try again." });
        return;
      }
      const finished = await readNdjson(res, dispatch);
      if (!finished && !signal.aborted) dispatch({ type: "error", message: LOST_CONNECTION });
    },
    [jobId]
  );

  const run = useCallback((work) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    work(controller.signal);
  }, []);

  // Leaving the page only stops reading; the call keeps going on the server and its letter is saved.
  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    run(async (signal) => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cover-letter`, { signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const { coverLetter, inFlight } = await res.json();
        if (signal.aborted) return;
        if (coverLetter) dispatch({ type: "done", letter: coverLetter });
        else if (inFlight) await stream(signal, null);
        else dispatch({ type: "idle" });
      } catch {
        if (!signal.aborted) dispatch({ type: "error", message: "Couldn't check for a saved cover letter. Try again." });
      }
    });
  }, [jobId, run, stream]);

  const generate = useCallback(() => run((signal) => stream(signal)), [run, stream]);

  return { ...state, generate };
}

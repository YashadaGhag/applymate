import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { EditorContent } from "@tiptap/react";
import { RESUME_DOCUMENT_CLASSES } from "../../../shared/resumeHtml.js";
import {
  PAGE_GAP,
  PAGE_HEIGHT,
  PAGE_MARGIN,
  PAGE_WIDTH,
  atomElements,
  atomPositions,
  paginate,
  paginationKey,
} from "./pagination";

// Wait this long after the last edit before re-measuring pages, so typing never waits on layout.
const REPAGINATE_DELAY_MS = 150;
// Correction passes for the spacer heights (one is normally enough; see below).
const MAX_CORRECTIONS = 3;

/**
 * The editor on US Letter sheets, like a word processor: white sheets with a grey gap, the editor
 * running across them at the printed content width, and on-screen spacers (decorations, never
 * content) pushing each page's first block onto the next sheet.
 *
 * Where pages break comes from a hidden copy of exactly what Export prints (editor.getHTML() with
 * the same document classes, at the printed width), with the print rules replayed on it
 * (pagination.js). The live editor is then measured and each spacer corrected, so every page's first
 * block sits exactly at its sheet's top margin. Re-run after each pause in editing, and when fonts
 * finish loading. Reports the page count through onPageCount.
 *
 * When the column is narrower than a sheet, the sheets and the editor scale down together with a
 * CSS transform (never above 100%). The editor's layout stays at full size, so wrapping, spacers and
 * page breaks are identical at any scale; only measurements of the live editor are divided by it.
 */
export function PagedResumeEditor({ editor, onPageCount }) {
  const frameRef = useRef(null);
  const stackRef = useRef(null);
  const measureRef = useRef(null);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);

  // Fit the sheet to the column: scale = available width / sheet width, at most 1.
  useEffect(() => {
    const frameEl = frameRef.current;
    if (!frameEl) return undefined;
    const update = () => {
      const next = Math.min(1, frameEl.clientWidth / PAGE_WIDTH);
      scaleRef.current = next;
      setScale(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frameEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!editor) return undefined;
    let timer = null;
    let frame = null;
    let disposed = false;

    const setSpacers = (spacers) => {
      if (disposed || editor.isDestroyed) return;
      const tr = editor.state.tr.setMeta(paginationKey, spacers).setMeta("addToHistory", false);
      editor.view.dispatch(tr);
    };

    const repaginate = () => {
      if (disposed || editor.isDestroyed || !measureRef.current || !stackRef.current) return;
      const measure = measureRef.current;
      // Same HTML and classes as the print copy (ResumePrint), at the printed content width.
      measure.innerHTML = editor.getHTML();
      const origin = measure.getBoundingClientRect().top;
      const atoms = atomElements(measure).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top - origin,
          bottom: r.bottom - origin,
          tag: el.tagName,
        };
      });
      measure.innerHTML = "";
      const positions = atomPositions(editor.state.doc);
      if (atoms.length === 0 || positions.length !== atoms.length) {
        setSpacers([]);
        setPageCount(1);
        onPageCount?.(1);
        return;
      }

      const { breaks, pageCount: pages } = paginate(atoms);
      setPageCount(pages);
      onPageCount?.(pages);

      // First guess from the hidden copy: push each page's first block from where it sits (moved
      // down by the spacers above it) to the next sheet's top margin. Corrected below.
      let shift = 0;
      let spacers = breaks.map((atomIndex, i) => {
        const height = Math.max(1, (i + 1) * (PAGE_HEIGHT + PAGE_GAP) - (atoms[atomIndex].top + shift));
        shift += height;
        return { pos: positions[atomIndex], height };
      });
      setSpacers(spacers);

      // Correct against the live layout: margins next to a spacer don't collapse the way they do
      // in the printed copy. Each block's error includes the errors of the spacers above it, so
      // each spacer takes its own error minus the one before. Heights stay above zero, so margins
      // never collapse through a spacer and one pass normally lands exactly.
      let pass = 0;
      const correct = () => {
        frame = null;
        if (disposed || editor.isDestroyed || !stackRef.current) return;
        const stackTop = stackRef.current.getBoundingClientRect().top;
        // Live positions are on screen, so scaled; spacer heights are in unscaled layout px.
        const toLayout = 1 / scaleRef.current;
        let previousError = 0;
        let worst = 0;
        const next = spacers.map((s, i) => {
          const el = editor.view.nodeDOM(s.pos);
          if (!(el instanceof HTMLElement)) return s;
          const actual = (el.getBoundingClientRect().top - stackTop) * toLayout;
          const desired = (i + 1) * (PAGE_HEIGHT + PAGE_GAP) + PAGE_MARGIN;
          const error = desired - actual;
          worst = Math.max(worst, Math.abs(error));
          const height = Math.max(1, s.height + error - previousError);
          previousError = error;
          return { ...s, height };
        });
        if (worst < 0.5 || pass >= MAX_CORRECTIONS) return;
        pass += 1;
        spacers = next;
        setSpacers(spacers);
        frame = requestAnimationFrame(correct);
      };
      frame = requestAnimationFrame(correct);
    };

    const schedule = () => {
      clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      timer = setTimeout(repaginate, REPAGINATE_DELAY_MS);
    };

    editor.on("update", schedule);
    document.fonts?.addEventListener?.("loadingdone", schedule);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      editor.off("update", schedule);
      document.fonts?.removeEventListener?.("loadingdone", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [editor, onPageCount]);

  const stackHeight = pageCount * PAGE_HEIGHT + (pageCount - 1) * PAGE_GAP;
  return (
    <div ref={frameRef} className="w-full">
      {/* The scaled size, so the column never scrolls sideways; the scale, sheet positions and the
          stack's height are only known at run time: inline styles. */}
      <div className="mx-auto" style={{ width: PAGE_WIDTH * scale, height: stackHeight * scale }}>
        <div className="w-page origin-top-left" style={scale < 1 ? { transform: `scale(${scale})` } : undefined}>
          <div ref={stackRef} className="relative" style={{ height: stackHeight }}>
            {Array.from({ length: pageCount }, (_, page) => (
              <div
                key={page}
                aria-hidden="true"
                className="absolute left-0 h-page w-page border border-neutral-100 bg-white"
                style={{ top: page * (PAGE_HEIGHT + PAGE_GAP) }}
              />
            ))}
            <div className="relative p-page-margin">
              <EditorContent editor={editor} className={`${RESUME_DOCUMENT_CLASSES} [&_.ProseMirror]:outline-none`} />
            </div>
          </div>
        </div>
      </div>
      {/* Hidden copy used only to measure where printed pages break. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className={`pointer-events-none invisible fixed left-0 top-0 w-page-content ${RESUME_DOCUMENT_CLASSES}`}
      />
    </div>
  );
}

PagedResumeEditor.propTypes = {
  editor: PropTypes.object,
  onPageCount: PropTypes.func,
};

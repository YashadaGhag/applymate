import { useEditor } from "@tiptap/react";
import { cleanPastedHtml, resumeExtensions } from "./extensions";
import { loadDocumentFonts } from "./fonts";

/**
 * The tailored resume (or cover letter) as a TipTap editor (desktop only). Loads `html` once, when
 * it mounts; every edit calls onUpdate(html). `editable: false` is the view mode (read-only: no caret,
 * typing or paste; text stays selectable). The editor saves nothing itself: Customize Application keeps each tab's in-progress
 * HTML in page state (an editor remounted on a tab switch loads it back) and saves it only on Save.
 */
export function useResumeEditor({ html, onUpdate, label = "Tailored resume", editable = true }) {
  return useEditor(
    {
      extensions: resumeExtensions,
      content: html,
      editable,
      editorProps: {
        attributes: { "aria-label": label, spellcheck: "true" },
        transformPastedHTML: cleanPastedHtml,
      },
      onUpdate: ({ editor }) => onUpdate?.(editor.getHTML()),
    },
    []
  );
}

/**
 * Export PDF: the browser's print dialog, with "Save as PDF" as the destination. The page title
 * becomes the suggested file name while the dialog is open, then goes back.
 *
 * Fonts: browsers only download a web font once something visible uses it, and the print copy is
 * hidden on screen, so the regular and bold weights of every font the document uses (the default
 * plus any chosen in the editor) are loaded first. Otherwise the PDF could fall back to Times.
 */
export async function printResume(fileName, html = "") {
  const previousTitle = document.title;
  const restore = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };
  await loadDocumentFonts(html);
  document.title = fileName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  window.addEventListener("afterprint", restore);
  window.print();
}

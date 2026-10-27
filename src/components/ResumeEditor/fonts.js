// The resume editor's fonts, all loaded from Google Fonts in src/index.css. Inter is the
// document's default (font-document), so choosing it clears any font set on the selection.
export const DEFAULT_FONT = "Inter";

// className: the font-family token, so the font menu shows each name in its own typeface.
export const FONTS = [
  { name: "Inter", stack: null, className: "font-document" },
  { name: "Merriweather", stack: "Merriweather, serif", className: "font-merriweather" },
  { name: "Lato", stack: "Lato, sans-serif", className: "font-lato" },
  { name: "Roboto", stack: "Roboto, sans-serif", className: "font-roboto" },
];

/**
 * Loads the regular and bold weights of every font a document uses (the default plus any chosen in
 * the editor), so a printed or generated PDF doesn't fall back to Times: browsers only download a
 * web font once something visible uses it, and the print copy is hidden on screen. Shared by Export
 * PDF (printResume) and the print page the server's PDF download opens.
 */
export async function loadDocumentFonts(html = "") {
  const used = FONTS.filter((f) => f.name === DEFAULT_FONT || html.includes(f.name));
  try {
    await Promise.all(used.flatMap((f) => [document.fonts.load(`400 12px "${f.name}"`), document.fonts.load(`700 12px "${f.name}"`)]));
    await document.fonts.ready;
  } catch {
    // Printing with fallback fonts beats not printing at all.
  }
}

/** The font name for a selection's font-family value (null means the default). */
export function fontNameFor(fontFamily) {
  if (!fontFamily) return DEFAULT_FONT;
  const first = fontFamily.split(",")[0].replace(/["']/g, "").trim();
  return FONTS.find((f) => f.name === first)?.name ?? first;
}

// Font size stepper, in points (what people know from word processors; 1pt = 4/3px). Body text
// defaults to 10pt and the name to 20pt; the stepper goes from 8pt to 36pt. Unset text shows its
// block's size from the document styles.
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 36;
export const NAME_FONT_SIZE = 20; // h1, text-document-name
export const BODY_FONT_SIZE = 10; // everything else, text-document-body

/** A font-size style value ("14pt", or "16px" from pasted or older content) in whole points. */
export function toPoints(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(String(value).trim().endsWith("px") ? n * 0.75 : n);
}

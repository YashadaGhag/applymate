import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

/**
 * Pulls plain text and hyperlink targets out of an uploaded resume, locally (no API call).
 * Links matter because resumes often hyperlink a word like "LinkedIn" or "Portfolio": the
 * visible text has no URL, only the link target does.
 * Returns { text, links } where links is a deduped list of http(s) URLs (mailto/tel dropped).
 * Supports PDF and DOCX; anything else throws and the Role page falls back to manual entry.
 */
export async function extractResumeContent(buffer, fileName) {
  const name = fileName.toLowerCase();
  let text;
  let rawLinks = [];

  if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    ({ text } = await extractText(pdf, { mergePages: true }));
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const annotations = await page.getAnnotations();
      for (const a of annotations) {
        if (a.subtype === "Link" && (a.url || a.unsafeUrl)) rawLinks.push(a.url || a.unsafeUrl);
      }
    }
  } else if (name.endsWith(".docx")) {
    ({ value: text } = await mammoth.extractRawText({ buffer }));
    // Raw text drops hyperlinks; the HTML conversion keeps them as <a href>.
    const { value: html } = await mammoth.convertToHtml({ buffer });
    rawLinks = [...html.matchAll(/<a\s[^>]*href="([^"]+)"/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  } else {
    throw new Error(`Can't read text from ${fileName}. Supported for extraction: PDF, DOCX.`);
  }

  const links = [...new Set(rawLinks.map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l)))];

  // Collapse runs of spaces and blank lines; keeps the prompt small without losing content.
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  return { text, links };
}

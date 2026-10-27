import fs from "node:fs";
import { createHash } from "node:crypto";
import express, { Router } from "express";
import {
  getWritingStyleStore,
  updateWritingStyleStore,
  saveWritingStyleFile,
  deleteWritingStyleFile,
  readWritingStyleFile,
  writingStyleFilePath,
} from "../store/store.js";
import { extractResumeContent } from "../resume/extractText.js";
import { summarizeWritingStyle, isWritingStyleSet, STYLE_VERSION } from "../ai/summarizeStyle.js";

const router = Router();

export const TONE_MAX_CHARS = 1000;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

// The letter arrives base64-encoded inside the JSON body (~4/3 of the file size), so this route
// has its own parser with room for a 25MB file. It's mounted before the app-wide express.json().
const jsonWithFile = express.json({ limit: Math.ceil((MAX_FILE_SIZE * 4) / 3) + 64 * 1024 });

function hasStoredFile(letter) {
  return Boolean(letter?.storedAs) && fs.existsSync(writingStyleFilePath(letter.storedAs));
}

// What the browser gets: the tone text it wrote and the attached file's name. Never the letter's
// text (not stored) and never the summary (server-side input for cover letters). downloadable is
// false for a letter saved before original files were kept.
function publicStyle(store) {
  return {
    tone: store.tone ?? "",
    letter: store.letter
      ? { fileName: store.letter.fileName, summarizedAt: store.letter.summarizedAt, downloadable: hasStoredFile(store.letter) }
      : null,
    isSet: isWritingStyleSet(store),
    updatedAt: store.updatedAt,
  };
}

class LetterError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Reads the letter's text and makes the one summary call. The text stays in this function: only
// the summary is kept.
async function summarizeFile(buffer, fileName, fileHash) {
  let text;
  try {
    ({ text } = await extractResumeContent(buffer, fileName));
  } catch (err) {
    console.warn(`[writing-style] couldn't read ${fileName}: ${err.message}`);
    throw new LetterError(422, "Couldn't read text from this file. Try another PDF or DOCX.");
  }
  if (!text) throw new LetterError(422, "No text found in this file (it may be a scanned image).");
  try {
    const { summary, model, styleVersion, droppedCopied } = await summarizeWritingStyle(text, { fileHash });
    if (droppedCopied) console.log(`[writing-style] dropped ${droppedCopied} summary item(s) that repeated the letter`);
    return { styleVersion, summary, model, summarizedAt: new Date().toISOString() };
  } catch (err) {
    console.warn(`[writing-style] summary failed for ${fileName}: ${err.message}`);
    const tooLong = /over the .* limit/.test(err.message);
    throw new LetterError(
      tooLong ? 422 : 502,
      tooLong ? "This file is too long to be a cover letter." : "Couldn't read the letter's style right now. Your changes weren't saved. Try again."
    );
  }
}

/**
 * GET /api/writing-style
 * Returns { tone, letter: { fileName, summarizedAt, downloadable } | null, isSet, updatedAt }.
 * Never makes a call.
 */
router.get("/writing-style", (req, res) => {
  res.json(publicStyle(getWritingStyleStore()));
});

/**
 * GET /api/writing-style/letter
 * The stored original letter file, as an attachment with its original name. 404 when there's no
 * letter or its file wasn't kept. Never makes a call.
 */
router.get("/writing-style/letter", (req, res) => {
  const { letter } = getWritingStyleStore();
  if (!hasStoredFile(letter)) return res.status(404).json({ error: "No cover letter file is saved." });
  res.setHeader("Cache-Control", "no-store");
  res.download(writingStyleFilePath(letter.storedAs), letter.fileName);
});

/**
 * PUT /api/writing-style
 * Body: { tone: string, letter: { action: "keep" } | { action: "remove" }
 *                             | { action: "replace", fileName, data (base64 file bytes) } }
 *
 * All or nothing: if a newly attached letter can't be read or summarized, nothing is saved (tone
 * included). Tone is stored as written, no call. A replaced letter gets one summary call, unless
 * it's the same file (SHA-256 of its bytes) already summarized at the current STYLE_VERSION. Its
 * original file is kept in data/writing-style-files/ (the old one is deleted); the letter's text
 * is not stored. Removing the letter deletes its file and summary.
 * "keep" with a summary from an older STYLE_VERSION and a stored file: the file is re-summarized
 * (one call), only here, on an explicit save. If that refresh fails, the older summary stays and
 * the rest of the save still goes through (the person didn't ask to change the letter).
 * Returns the same shape as GET.
 */
router.put("/writing-style", jsonWithFile, async (req, res) => {
  const { tone, letter } = req.body ?? {};
  if (typeof tone !== "string") {
    return res.status(400).json({ error: "Expected body.tone to be a string." });
  }
  if (tone.length > TONE_MAX_CHARS) {
    return res.status(400).json({ error: `Tone can be at most ${TONE_MAX_CHARS} characters.` });
  }
  const action = letter?.action;
  if (!["keep", "remove", "replace"].includes(action)) {
    return res.status(400).json({ error: 'Expected body.letter.action to be "keep", "remove" or "replace".' });
  }

  const current = getWritingStyleStore().letter;
  let nextLetter = action === "remove" ? null : current;

  if (action === "replace") {
    const fileName = typeof letter.fileName === "string" ? letter.fileName.trim() : "";
    const extension = ACCEPTED_EXTENSIONS.find((ext) => fileName.toLowerCase().endsWith(ext));
    if (!extension) {
      return res.status(400).json({ error: "Unsupported file format. Please attach a PDF or DOCX." });
    }
    const buffer = typeof letter.data === "string" ? Buffer.from(letter.data, "base64") : null;
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "The attached file is empty." });
    }
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ error: "File exceeds 25MB limit." });
    }

    const fileHash = createHash("sha256").update(buffer).digest("hex");
    let summarized;
    if (current?.fileHash === fileHash && current.styleVersion === STYLE_VERSION && current.summary) {
      console.log(`[writing-style] ${fileName}: same file as the saved letter, no API call`);
      summarized = { styleVersion: current.styleVersion, summary: current.summary, model: current.model, summarizedAt: current.summarizedAt };
    } else {
      try {
        summarized = await summarizeFile(buffer, fileName, fileHash);
      } catch (err) {
        if (err instanceof LetterError) return res.status(err.status).json({ error: err.message });
        throw err;
      }
    }
    const storedAs = saveWritingStyleFile(buffer, fileHash, extension);
    nextLetter = { fileName, fileHash, storedAs, size: buffer.length, ...summarized };
  } else if (action === "keep" && current && current.styleVersion !== STYLE_VERSION && hasStoredFile(current)) {
    const buffer = readWritingStyleFile(current.storedAs);
    try {
      console.log(`[writing-style] ${current.fileName}: summary is STYLE_VERSION ${current.styleVersion}, re-summarizing the stored file`);
      nextLetter = { ...current, ...(await summarizeFile(buffer, current.fileName, current.fileHash)) };
    } catch (err) {
      console.warn(`[writing-style] refresh failed, keeping the older summary: ${err.message}`);
    }
  }

  let next;
  try {
    next = updateWritingStyleStore((store) => ({ ...store, tone, letter: nextLetter, updatedAt: new Date().toISOString() }));
  } catch (err) {
    // Don't leave a new file behind that nothing points to.
    if (nextLetter?.storedAs && nextLetter.storedAs !== current?.storedAs) deleteWritingStyleFile(nextLetter.storedAs);
    throw err;
  }
  // The old file goes only once the store no longer points to it.
  if (current?.storedAs && current.storedAs !== nextLetter?.storedAs) deleteWritingStyleFile(current.storedAs);
  res.json(publicStyle(next));
});

export default router;

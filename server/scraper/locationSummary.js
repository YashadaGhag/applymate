import { parseJobLocation } from "./jobLocation.js";
import { passingLocationPieces } from "./filterJobs.js";

/**
 * What a job card shows for a multi-location posting: one location and a count of the rest.
 * Plain code, read time. The wording of each location is the posting's own (the parsed piece's
 * text, never normalized). The lead is the first location that passes this profile's location
 * check, else the first listed. Repeats (same text, ignoring case) count once.
 * Returns { all, lead, more }; a posting with one location (or none) leads with its whole text.
 */
export function summarizeLocation(job, profile) {
  const text = job.location ?? "";
  const seen = new Set();
  const all = [];
  for (const piece of parseJobLocation(text)) {
    const key = piece.text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      all.push(piece.text);
    }
  }
  if (all.length <= 1) return { all: all.length ? all : [], lead: text || null, more: 0 };
  const passing = passingLocationPieces(job, profile).find((p) => seen.has(p.text.toLowerCase()));
  const lead = passing ? passing.text : all[0];
  return { all, lead, more: all.length - 1 };
}

/**
 * Designation suggestions match typed text at the start of words: every typed word must start a word
 * of the title, in order ("design" matches "Product Designer" and "Design Systems", never "Redesign
 * Lead"; "prod des" matches "Product Designer"). One rule for the server's ranking and the client's
 * display, so they never disagree.
 */
export function typedTokens(text) {
  return String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

export function matchesWordStarts(title, tokens) {
  const words = String(title).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let from = 0;
  for (const token of tokens) {
    const at = words.findIndex((w, i) => i >= from && w.startsWith(token));
    if (at === -1) return false;
    from = at + 1;
  }
  return true;
}

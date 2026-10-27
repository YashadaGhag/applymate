// Options and small helpers shared by the Role page and the Change Preferences modals.

export const REQUIRED_MESSAGE = "Please answer this question.";

export function sameValues(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

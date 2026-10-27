/**
 * Watches a JSON object as it streams in and reports each element of its top-level arrays the
 * moment that element is complete, so a caller can forward whole pieces (one resume section, one
 * gap) instead of half-written text. Only the shape { key: [elements…], … } is tracked; anything
 * nested deeper is part of an element and comes back parsed with it.
 *
 * Callbacks:
 * - onElementStart(key, index): an element of array `key` has begun.
 * - onElementProgress(key, index, partialText): more of an unfinished object element arrived.
 * - onElement(key, index, value): the element is complete and parsed.
 * - onArrayEnd(key, value): array `key` closed; value is the whole array, parsed.
 */
export function createArrayElementStream({ onElementStart, onElementProgress, onElement, onArrayEnd } = {}) {
  let text = "";
  let pos = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  let lastTopLevelString = null;
  let topKey = null;
  let arrayKey = null;
  let arrayStart = -1;
  let index = 0;
  let elementStart = -1;

  function push(chunk) {
    text += chunk;
    for (; pos < text.length; pos++) {
      const c = text[pos];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') {
          inString = false;
          const raw = text.slice(stringStart, pos + 1);
          if (depth === 1) lastTopLevelString = JSON.parse(raw);
          else if (depth === 2 && arrayKey) onElement?.(arrayKey, index++, JSON.parse(raw));
        }
        continue;
      }
      if (c === '"') {
        inString = true;
        stringStart = pos;
        if (depth === 2 && arrayKey) onElementStart?.(arrayKey, index);
      } else if (c === ":" && depth === 1) {
        topKey = lastTopLevelString;
      } else if (c === "{" || c === "[") {
        depth++;
        if (depth === 2 && c === "[") {
          arrayKey = topKey;
          arrayStart = pos;
          index = 0;
        } else if (depth === 3 && arrayKey) {
          elementStart = pos;
          onElementStart?.(arrayKey, index);
        }
      } else if (c === "}" || c === "]") {
        if (depth === 3 && arrayKey && elementStart >= 0) {
          onElement?.(arrayKey, index++, JSON.parse(text.slice(elementStart, pos + 1)));
          elementStart = -1;
        } else if (depth === 2 && arrayKey && c === "]") {
          onArrayEnd?.(arrayKey, JSON.parse(text.slice(arrayStart, pos + 1)));
          arrayKey = null;
        }
        depth--;
      }
      // Number, boolean and null array elements aren't used by any schema here, so they're ignored.
    }
    if (elementStart >= 0) onElementProgress?.(arrayKey, index, text.slice(elementStart));
  }

  return { push, text: () => text };
}

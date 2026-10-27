/**
 * Reads an NDJSON response body (one JSON event per line) to its end, calling onEvent(event) for
 * each line. Resolves true when a "done" or "error" event arrived, false when the stream ended or
 * broke without one (a lost connection). Never throws; an abort just resolves.
 */
export async function readNdjson(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        onEvent(event);
        if (event.type === "done" || event.type === "error") finished = true;
      }
    }
  } catch {
    // Aborted (leaving the page) or the connection broke: the caller decides what that means.
  }
  return finished;
}

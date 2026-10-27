// Request helpers shared by the careers-source adapters.

export const TIMEOUT_MS = 10_000;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One JSON board request -> its raw job list. Any error (including an unexpected shape) throws, so
 * the caller leaves stored jobs alone. `extract` returns the array, or null for an unexpected shape.
 */
export async function fetchBoardJobs(url, extract) {
  let response;
  try {
    response = await fetchWithTimeout(url, TIMEOUT_MS);
  } catch (err) {
    throw new Error(err.name === "AbortError" ? "timeout" : err.message, { cause: err });
  }
  if (!response.ok) {
    throw new Error(`unexpected status ${response.status}`);
  }
  const data = await response.json();
  const rawJobs = extract(data);
  if (rawJobs === null) {
    throw new Error("unexpected response shape");
  }
  return rawJobs;
}

export function normalizeCompanyName(raw) {
  return raw
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|corp|co)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

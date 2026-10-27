import { fileURLToPath } from "node:url";
import { getState, updateState } from "../store/store.js";
import registry from "./adapters/registry.js";
import { fetchWithTimeout, TIMEOUT_MS as FETCH_TIMEOUT_MS } from "./adapters/http.js";

const TIMEOUT_MS = FETCH_TIMEOUT_MS;
const COMPANY_DELAY_MS = 1500;

// Which sources exist, how to probe them and how each response is shaped is in the adapters
// (adapters/*.js), registered in adapters/registry.js. A valid board with zero current postings
// returns 200 with an empty list on all three ATS platforms (confirmed live for Lever's own "lever"
// board and Ashby's "deel" board); that 200+[] response is indistinguishable from "wrong slug happened
// to 200" without more signal, so it's never treated as a match.


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveSlugCandidates(name, domain) {
  const candidates = [];
  const add = (slug) => {
    if (slug && !candidates.includes(slug)) candidates.push(slug);
  };

  add(name.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  add(
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
  if (domain) {
    add(domain.toLowerCase().replace(/^www\./, "").split(".")[0]);
  }

  return candidates;
}

async function probe(adapter, slug) {
  const url = adapter.probe.url(slug);
  let response;
  try {
    response = await fetchWithTimeout(url, TIMEOUT_MS);
  } catch (err) {
    return { outcome: "error", url, detail: err.name === "AbortError" ? "timeout" : err.message };
  }

  if (response.status === 404) {
    return { outcome: "not_found", url, httpStatus: 404 };
  }

  if (!response.ok) {
    return { outcome: "error", url, httpStatus: response.status, detail: `unexpected status ${response.status}` };
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    return { outcome: "error", url, httpStatus: response.status, detail: `invalid JSON: ${err.message}` };
  }

  const jobs = adapter.probe.extract(data);
  if (jobs === null) {
    return { outcome: "error", url, httpStatus: response.status, detail: "unexpected response shape" };
  }

  if (jobs.length > 0) {
    return { outcome: "match", url, httpStatus: response.status, jobCount: jobs.length };
  }

  return { outcome: "ambiguous", url, httpStatus: response.status, jobCount: 0 };
}

function keyFor(platform, slug) {
  return `${platform}:${slug}`;
}

// A source with no board to probe (a domain rule in its adapter, e.g. a company with its own careers
// JSON) sets the company up directly, with no requests.
export async function detectCompany(company, meta, reg = registry) {
  const direct = reg.recognize(company);
  if (direct) {
    return {
      atsPlatform: direct.adapter.id, atsSlug: direct.slug, scrapeStatus: "ok", atsHint: null,
      attempts: [{ platform: direct.adapter.id, slug: direct.slug, outcome: "match", note: direct.note ?? "not probed" }],
    };
  }
  const attempts = [];
  const tried = new Set();
  let hadError = false;
  let hint = null;

  // A stored hint (a prior 200+empty or Greenhouse name mismatch) is checked before
  // deriving fresh candidates — if the real-world board has since picked up postings,
  // or a GH mismatch resolves differently, this settles it in one request instead of re-guessing.
  if (meta.atsHint?.platform && meta.atsHint?.slug) {
    const platform = reg.getAdapter(meta.atsHint.platform);
    if (platform?.probe) {
      const slug = meta.atsHint.slug;
      const result = await probe(platform, slug);
      attempts.push({ platform: platform.id, slug, fromHint: true, ...result });
      tried.add(keyFor(platform.id, slug));

      if (result.outcome === "match") {
        if (platform.probe.verifyName) {
          const verification = await platform.probe.verifyName(slug, company.name);
          attempts.push({ platform: platform.id, slug, step: "name-verify", fromHint: true, ...verification });
          if (verification.outcome === "match") {
            return { atsPlatform: platform.id, atsSlug: slug, scrapeStatus: "ok", atsHint: null, attempts };
          }
          if (verification.outcome === "mismatch") {
            hint = { platform: platform.id, slug, seenAt: new Date().toISOString() };
          } else {
            hadError = true;
          }
        } else {
          return { atsPlatform: platform.id, atsSlug: slug, scrapeStatus: "ok", atsHint: null, attempts };
        }
      } else if (result.outcome === "ambiguous") {
        hint = { platform: platform.id, slug, seenAt: new Date().toISOString() };
      } else if (result.outcome === "error") {
        hadError = true;
      }
      // not_found means the hinted board is gone — hint stays null and normal probing below takes over.
    }
  }

  const candidates = deriveSlugCandidates(company.name, company.domain);

  for (const platform of reg.probeAdapters()) {
    for (const slug of candidates) {
      const key = keyFor(platform.id, slug);
      if (tried.has(key)) continue;
      tried.add(key);

      const result = await probe(platform, slug);
      attempts.push({ platform: platform.id, slug, ...result });

      if (result.outcome === "match") {
        if (platform.probe.verifyName) {
          const verification = await platform.probe.verifyName(slug, company.name);
          attempts.push({ platform: platform.id, slug, step: "name-verify", ...verification });
          if (verification.outcome === "match") {
            return { atsPlatform: platform.id, atsSlug: slug, scrapeStatus: "ok", atsHint: null, attempts };
          }
          if (verification.outcome === "mismatch") {
            if (!hint) hint = { platform: platform.id, slug, seenAt: new Date().toISOString() };
          } else {
            hadError = true;
          }
          continue;
        }
        return { atsPlatform: platform.id, atsSlug: slug, scrapeStatus: "ok", atsHint: null, attempts };
      }

      if (result.outcome === "ambiguous" && !hint) {
        hint = { platform: platform.id, slug, seenAt: new Date().toISOString() };
      }
      if (result.outcome === "error") {
        hadError = true;
      }
    }
  }

  // A failed request means we don't actually know the answer, so it must stay "error"
  // rather than get recorded as the stronger claim "no_source".
  return {
    atsPlatform: null,
    atsSlug: null,
    scrapeStatus: hadError ? "error" : "no_source",
    atsHint: hint,
    attempts,
  };
}

export function shouldProcess(company, meta, force, reg = registry) {
  // A source that recognises the company by itself, not yet recorded; or a stored source this build no
  // longer has: set it up again (it ends as a normal detection, e.g. no_source).
  const direct = reg.recognize(company);
  if (direct && meta.atsPlatform !== direct.adapter.id) return { process: true };
  if (meta.atsPlatform && !reg.getAdapter(meta.atsPlatform)) return { process: true };
  if (company.isCustom && !company.domain) {
    return { process: false, reason: "custom company with no domain" };
  }
  if (!meta.scrapeStatus) {
    return { process: true };
  }
  if (meta.scrapeStatus === "error") {
    return { process: true };
  }
  if (meta.scrapeStatus === "no_source") {
    return force ? { process: true } : { process: false, reason: 'scrapeStatus "no_source" (use --force to retry)' };
  }
  return { process: false, reason: 'scrapeStatus "ok"' };
}

/**
 * Writes one detection result into companyMeta (server-owned, never on the watchlist item). Other
 * companyMeta fields (the background-work bookkeeping of server/scheduler/newCompanies.js) are kept.
 * Shared by `npm run detect:ats` and the new-company background work.
 */
export function storeDetection(companyId, detection) {
  return updateState((s) => ({
    ...s,
    companyMeta: {
      ...s.companyMeta,
      [companyId]: {
        ...(s.companyMeta?.[companyId] ?? {}),
        atsPlatform: detection.atsPlatform,
        atsSlug: detection.atsSlug,
        scrapeStatus: detection.scrapeStatus,
        atsHint: detection.atsHint ?? null,
        detectedAt: new Date().toISOString(),
      },
    },
  }));
}

async function run() {
  const force = process.argv.includes("--force");
  const state = getState();

  const report = [];

  for (const company of state.watchlist) {
    const meta = state.companyMeta[company.id] ?? {};
    const decision = shouldProcess(company, meta, force);
    if (!decision.process) {
      report.push({ company: company.name, skipped: true, reason: decision.reason });
      continue;
    }

    const detection = await detectCompany(company, meta);
    report.push({ company: company.name, domain: company.domain, ...detection });

    storeDetection(company.id, detection);

    await sleep(COMPANY_DELAY_MS);
  }

  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}

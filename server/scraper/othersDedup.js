import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OTHERS_CONFIG_PATH = path.join(__dirname, "othersCompanies.json");

export function loadOthersConfig() {
  const raw = fs.readFileSync(OTHERS_CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

export function normalizeDomain(domain) {
  return (domain ?? "").toLowerCase().replace(/^www\./, "");
}

function platformSlugKey(platform, slug) {
  return `${(platform ?? "").toLowerCase()}:${(slug ?? "").toLowerCase()}`;
}

// "A company on both lists belongs to the Watchlist only" is matched by ATS platform + slug — the
// same board, however the company's name or domain happens to be spelled on each list — because
// domain alone already broke once (notion.so vs notion.com). Domain is only a fallback, for a
// watchlist company with no confirmed board at all (nothing to match a platform+slug against), so
// it doesn't still slip through as a duplicate just because detection hasn't found its source yet.
export function buildWatchlistDedupKeys(state) {
  const platformSlugKeys = new Set();
  const domainKeys = new Set();

  for (const company of state.watchlist) {
    const meta = state.companyMeta?.[company.id];
    if (meta?.scrapeStatus === "ok" && meta.atsPlatform && meta.atsSlug) {
      platformSlugKeys.add(platformSlugKey(meta.atsPlatform, meta.atsSlug));
    } else {
      const domain = normalizeDomain(company.domain);
      if (domain) domainKeys.add(domain);
    }
  }

  return { platformSlugKeys, domainKeys };
}

export function isOthersEntryOnWatchlist(entry, dedupKeys) {
  if (dedupKeys.platformSlugKeys.has(platformSlugKey(entry.atsPlatform, entry.atsSlug))) return true;
  return dedupKeys.domainKeys.has(normalizeDomain(entry.domain));
}

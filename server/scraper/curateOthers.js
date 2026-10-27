import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getState, getExemptJobIds } from "../store/store.js";
import { detectCompany } from "./detect.js";
import registry from "./adapters/registry.js";
import { filterJobs } from "./filterJobs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "othersCompanies.json");

const COMPANY_DELAY_MS = 600;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRawJobs(platformName, slug) {
  return registry.getAdapter(platformName).fetchJobs(slug);
}

// Candidate pool for the Others tab — a broad, role-agnostic mix of sizes and industries
// (fintech, dev tools, SaaS, marketplaces, health, AI, security, HR tech, etc.), hand-picked for
// likely Greenhouse/Lever/Ashby presence and enough scale to hire across functions, not just one.
// Verified live below; this file is the research tool, othersCompanies.json is the shipped result.
const CANDIDATES = [
  { name: "Airbnb", domain: "airbnb.com" },
  { name: "DoorDash", domain: "doordash.com" },
  { name: "Instacart", domain: "instacart.com" },
  { name: "Reddit", domain: "reddit.com" },
  { name: "Pinterest", domain: "pinterest.com" },
  { name: "Discord", domain: "discord.com" },
  { name: "Coinbase", domain: "coinbase.com" },
  { name: "Robinhood", domain: "robinhood.com" },
  { name: "GitLab", domain: "gitlab.com" },
  { name: "Asana", domain: "asana.com" },
  { name: "Figma", domain: "figma.com" },
  { name: "Webflow", domain: "webflow.com" },
  { name: "Vercel", domain: "vercel.com" },
  { name: "Brex", domain: "brex.com" },
  { name: "Carta", domain: "carta.com" },
  { name: "Gusto", domain: "gusto.com" },
  { name: "Typeform", domain: "typeform.com" },
  { name: "Mozilla", domain: "mozilla.org" },
  { name: "Attentive", domain: "attentive.com" },
  { name: "Samsara", domain: "samsara.com" },
  { name: "Palantir", domain: "palantir.com" },
  { name: "Ro", domain: "ro.co" },
  { name: "Linear", domain: "linear.app" },
  { name: "Vanta", domain: "vanta.com" },
  { name: "Ramp", domain: "ramp.com" },
  { name: "Deel", domain: "deel.com" },
  { name: "Airtable", domain: "airtable.com" },
  { name: "monday.com", domain: "monday.com" },
  { name: "ClickUp", domain: "clickup.com" },
  { name: "Calendly", domain: "calendly.com" },
  { name: "Loom", domain: "loom.com" },
  { name: "Miro", domain: "miro.com" },
  { name: "Canva", domain: "canva.com" },
  { name: "Zapier", domain: "zapier.com" },
  { name: "Front", domain: "front.com" },
  { name: "Intercom", domain: "intercom.com" },
  { name: "Segment", domain: "segment.com" },
  { name: "Amplitude", domain: "amplitude.com" },
  { name: "Pendo", domain: "pendo.io" },
  { name: "HashiCorp", domain: "hashicorp.com" },
  { name: "Confluent", domain: "confluent.io" },
  { name: "MongoDB", domain: "mongodb.com" },
  { name: "Datadog", domain: "datadoghq.com" },
  { name: "PagerDuty", domain: "pagerduty.com" },
  { name: "CircleCI", domain: "circleci.com" },
  { name: "Sentry", domain: "sentry.io" },
  { name: "LaunchDarkly", domain: "launchdarkly.com" },
  { name: "Postman", domain: "postman.com" },
  { name: "Grafana Labs", domain: "grafana.com" },
  { name: "Fastly", domain: "fastly.com" },
  { name: "DigitalOcean", domain: "digitalocean.com" },
  { name: "Render", domain: "render.com" },
  { name: "Netlify", domain: "netlify.com" },
  { name: "Etsy", domain: "etsy.com" },
  { name: "Thumbtack", domain: "thumbtack.com" },
  { name: "Nextdoor", domain: "nextdoor.com" },
  { name: "Faire", domain: "faire.com" },
  { name: "Whatnot", domain: "whatnot.com" },
  { name: "Squarespace", domain: "squarespace.com" },
  { name: "Klaviyo", domain: "klaviyo.com" },
  { name: "Postscript", domain: "postscript.io" },
  { name: "Rippling", domain: "rippling.com" },
  { name: "Lattice", domain: "lattice.com" },
  { name: "Culture Amp", domain: "cultureamp.com" },
  { name: "Checkr", domain: "checkr.com" },
  { name: "Drata", domain: "drata.com" },
  { name: "Flexport", domain: "flexport.com" },
  { name: "Convoy", domain: "convoy.com" },
  { name: "Included Health", domain: "includedhealth.com" },
  { name: "Oscar Health", domain: "hioscar.com" },
  { name: "Forward", domain: "goforward.com" },
  { name: "Cedar", domain: "cedar.com" },
  { name: "Tempus", domain: "tempus.com" },
  { name: "Kraken", domain: "kraken.com" },
  { name: "Chainalysis", domain: "chainalysis.com" },
  { name: "Circle", domain: "circle.com" },
  { name: "Gemini", domain: "gemini.com" },
  { name: "Roblox", domain: "roblox.com" },
  { name: "Anthropic", domain: "anthropic.com" },
  { name: "Hugging Face", domain: "huggingface.co" },
  { name: "Cohere", domain: "cohere.com" },
  { name: "Perplexity", domain: "perplexity.ai" },
  { name: "Opendoor", domain: "opendoor.com" },
  { name: "Compass", domain: "compass.com" },
  { name: "Allbirds", domain: "allbirds.com" },
  { name: "Warby Parker", domain: "warbyparker.com" },
  { name: "Coursera", domain: "coursera.org" },
  { name: "Duolingo", domain: "duolingo.com" },
  { name: "Udemy", domain: "udemy.com" },
  { name: "Instructure", domain: "instructure.com" },
  { name: "Medium", domain: "medium.com" },
  { name: "Substack", domain: "substack.com" },
  { name: "Remote", domain: "remote.com" },
  { name: "Lob", domain: "lob.com" },
  { name: "Clever", domain: "clever.com" },
  { name: "1Password", domain: "1password.com" },
  { name: "SentinelOne", domain: "sentinelone.com" },
  { name: "Snyk", domain: "snyk.io" },
  { name: "Okta", domain: "okta.com" },
  { name: "Addepar", domain: "addepar.com" },
];

async function run() {
  const state = getState();
  const watchlistDomains = new Set(state.watchlist.map((c) => (c.domain ?? "").toLowerCase()).filter(Boolean));
  const watchlistNames = new Set(state.watchlist.map((c) => c.name.toLowerCase()));

  const confirmed = [];
  const failed = [];
  const skipped = [];

  for (const candidate of CANDIDATES) {
    if (watchlistDomains.has(candidate.domain.toLowerCase()) || watchlistNames.has(candidate.name.toLowerCase())) {
      skipped.push({ ...candidate, reason: "already on watchlist" });
      continue;
    }

    const syntheticCompany = {
      id: `others:${candidate.domain}`,
      name: candidate.name,
      domain: candidate.domain,
      isCustom: false,
    };

    const detection = await detectCompany(syntheticCompany, {});

    if (detection.scrapeStatus !== "ok") {
      failed.push({ ...candidate, scrapeStatus: detection.scrapeStatus });
      await sleep(COMPANY_DELAY_MS);
      continue;
    }

    let rawJobs;
    try {
      rawJobs = await fetchRawJobs(detection.atsPlatform, detection.atsSlug);
    } catch (err) {
      failed.push({ ...candidate, scrapeStatus: "error", detail: `job fetch failed: ${err.message}` });
      await sleep(COMPANY_DELAY_MS);
      continue;
    }

    const platform = registry.getAdapter(detection.atsPlatform);
    const normalizedJobs = rawJobs.map((raw) => ({
      id: `${syntheticCompany.id}:${platform.rawId(raw)}`,
      ...platform.normalize(raw, syntheticCompany),
      firstSeenAt: new Date().toISOString(),
      closed: false,
    }));

    confirmed.push({
      name: candidate.name,
      domain: candidate.domain,
      atsPlatform: detection.atsPlatform,
      atsSlug: detection.atsSlug,
      totalOpenRoles: rawJobs.length,
      jobs: normalizedJobs,
    });

    await sleep(COMPANY_DELAY_MS);
  }

  // Sanity check: how many of ALL confirmed companies' open jobs pass the current profile prefilter
  // (60-day freshness + role/location/seniority/sponsorship). Not written anywhere — just a number
  // for the report, computed the same way /api/jobs would once this list is actually wired in.
  const profile = state.profile;
  const savedJobIds = [...getExemptJobIds(state)];
  const allJobs = confirmed.flatMap((c) => c.jobs);
  const prefilterResult = filterJobs({ jobs: allJobs, profile, savedJobIds });

  const configOutput = confirmed
    .map(({ name, domain, atsPlatform, atsSlug, totalOpenRoles }) => ({
      name,
      domain,
      atsPlatform,
      atsSlug,
      totalOpenRolesAtCuration: totalOpenRoles,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(configOutput, null, 2) + "\n", "utf-8");

  console.log("=== confirmed (sorted by name) ===");
  console.log(
    JSON.stringify(
      // eslint-disable-next-line no-unused-vars -- `jobs` is destructured only to leave it out of the report
      [...confirmed].sort((a, b) => a.name.localeCompare(b.name)).map(({ jobs, ...rest }) => rest),
      null,
      2
    )
  );
  console.log("=== failed detection ===");
  console.log(JSON.stringify(failed, null, 2));
  console.log("=== skipped (already on watchlist) ===");
  console.log(JSON.stringify(skipped, null, 2));
  console.log("=== sanity check ===");
  console.log(
    JSON.stringify(
      {
        candidatesProvided: CANDIDATES.length,
        confirmedCompanies: confirmed.length,
        failedCompanies: failed.length,
        skippedCompanies: skipped.length,
        totalOpenRolesAcrossConfirmed: allJobs.length,
        afterFreshness: allJobs.length - prefilterResult.hiddenByFreshness.length,
        afterPrefilter: prefilterResult.passed.length,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${configOutput.length} companies to ${OUTPUT_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}

// Run with: node --test server/scraper/adapters/adapters.test.js
// The adapter registry and each adapter's contract. No network, no AI: fetch is stubbed where a
// probe could run, and the store is a temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "applymate-adapters-test-"));
process.env.APPLYMATE_DATA_DIR = dataDir;
delete process.env.ANTHROPIC_API_KEY;

const { default: registry, createRegistry, assertAdapter } = await import("./registry.js");
const { detectCompany, shouldProcess } = await import("../detect.js");
const { runScrape, scrapeOthersCompany } = await import("../fetchJobs.js");
const { updateState } = await import("../../store/store.js");

const REAL = registry.adapters();
// A source found by a domain rule (no board to probe) is optional: these tests also pass in an export
// where such an adapter's file and registry line are gone.
const DOMAIN_RULE = REAL.filter((a) => a.recognize);
const company = { id: "c1", name: "Acme", domain: "acme.com" };

// One raw job per source, the shapes the sources return.
const SAMPLES = {
  greenhouse: { id: 1, title: "Product Designer", location: { name: "Remote, US" }, first_published: "2026-10-01T00:00:00Z", absolute_url: "https://x/1", content: "&lt;p&gt;Pay &amp;amp; benefits&lt;/p&gt;" },
  lever: { id: "a-b", text: "UX Designer", categories: { location: "Austin, TX" }, workplaceType: "Hybrid", createdAt: 1790000000000, hostedUrl: "https://l/1", descriptionPlain: "Desc", description: "<p>d</p>", salaryRange: { min: 100, max: 200, currency: "USD" } },
  ashby: { id: "u1", title: "Designer", location: "NYC", isRemote: true, publishedAt: "2026-10-02T00:00:00Z", jobUrl: "https://a/1", descriptionPlain: "Plain", descriptionHtml: "<p>h</p>" },
  domainRule: { id_icims: "123", title: "Designer II", posted_date: "October  8, 2026", job_path: "/en/jobs/123/x", description: "Do things<br/>- a", basic_qualifications: "BQ", locations: ['{"countryIso2a":"US","city":"Seattle","region":"WA","type":"ONSITE"}'] },
};
const sampleFor = (adapter) => (adapter.recognize ? SAMPLES.domainRule : SAMPLES[adapter.id]);
const FIELDS = ["source", "company", "title", "location", "workMode", "postedAt", "postedAtKind", "applyUrl", "descriptionText", "descriptionHtml", "compensation"];

test("registry shape: ids, names, order, sources", () => {
  assert.deepEqual(registry.supportedSources().map((s) => s.id), REAL.map((a) => a.id));
  assert.deepEqual(REAL.slice(0, 3).map((a) => a.id), ["greenhouse", "lever", "ashby"], "registration order");
  assert.ok(registry.supportedSources().every((s) => typeof s.name === "string" && s.name.length > 0));
  assert.deepEqual(registry.probeAdapters().map((a) => a.id), REAL.filter((a) => a.probe).map((a) => a.id), "probe order = registration order");
  assert.equal(registry.getAdapter("lever").name, "Lever");
  assert.equal(registry.getAdapter("nope"), null);
  for (const adapter of REAL) assert.doesNotThrow(() => assertAdapter(adapter), adapter.id);
});

test("registry rejects a malformed or duplicate adapter", () => {
  const ok = { id: "fake", name: "Fake", probe: { url: () => "", extract: () => [] }, fetchJobs: async () => [], rawId: () => 1, normalize: () => ({}) };
  assert.throws(() => createRegistry([{ ...ok, id: "Bad Id" }]), /bad id/);
  assert.throws(() => createRegistry([{ ...ok, normalize: undefined }]), /missing "normalize"/);
  assert.throws(() => createRegistry([{ ...ok, probe: undefined }]), /needs "recognize" or "probe"/);
  assert.throws(() => createRegistry([ok, ok]), /duplicate/);
});

test("each adapter's contract: ids, normalize fields, job id format", () => {
  for (const adapter of REAL) {
    const raw = sampleFor(adapter);
    const job = adapter.normalize(raw, company);
    assert.deepEqual(Object.keys(job).sort(), [...FIELDS].sort(), adapter.id);
    assert.equal(job.source, adapter.id);
    assert.deepEqual(job.company, { id: "c1", name: "Acme", domain: "acme.com" });
    assert.ok(["posted", "updated", "found"].includes(job.postedAtKind));
    assert.equal(typeof job.title, "string");
    assert.equal(typeof job.descriptionText, "string");
    assert.equal(typeof job.descriptionHtml, "string");
    assert.equal(typeof adapter.fetchJobs, "function");
    assert.ok(adapter.rawId(raw) != null);
  }
  const idOf = (a) => (a.jobId ? a.jobId(sampleFor(a), company) : `${company.id}:${a.rawId(sampleFor(a))}`);
  assert.equal(idOf(registry.getAdapter("greenhouse")), "c1:1");
  assert.equal(idOf(registry.getAdapter("lever")), "c1:a-b");
  assert.equal(idOf(registry.getAdapter("ashby")), "c1:u1");
  for (const adapter of DOMAIN_RULE) assert.equal(idOf(adapter), `${adapter.id}:${adapter.id}:123`, "a fixed id format is unchanged");
});

test("normalized values match what the app stored before the registry", () => {
  const gh = registry.getAdapter("greenhouse").normalize(SAMPLES.greenhouse, company);
  assert.equal(gh.location, "Remote, US");
  assert.equal(gh.postedAtKind, "posted");
  assert.equal(gh.descriptionText, "Pay & benefits");
  const lv = registry.getAdapter("lever").normalize(SAMPLES.lever, company);
  assert.equal(lv.workMode, "hybrid");
  assert.deepEqual(lv.compensation, { min: 100, max: 200, currency: "USD", isEstimate: false });
  assert.equal(registry.getAdapter("ashby").normalize(SAMPLES.ashby, company).workMode, "remote");
  for (const adapter of DOMAIN_RULE) {
    const job = adapter.normalize(SAMPLES.domainRule, company);
    assert.equal(job.location, "Seattle, WA");
    assert.equal(job.postedAt, "2026-10-08T00:00:00.000Z");
    assert.ok(job.applyUrl.endsWith("/en/jobs/123/x"));
  }
});

test("recognition: only a domain-rule source recognises a company without probing", () => {
  assert.equal(registry.recognize(company), null);
  assert.equal(registry.recognize({ name: "No site", domain: null }), null);
});

function stubFetch404() {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { status: 404, ok: false, json: async () => ({}) };
  };
  return { calls: () => calls, restore: () => (globalThis.fetch = original) };
}

test("without a domain-rule adapter, the rest keeps working and its company ends as no_source", async () => {
  const careers = { name: "Example Careers", domain: "careers-example.test" };
  const rule = {
    id: "ruled", name: "Ruled", fetchJobs: async () => [], rawId: (r) => r.n, normalize: (r, c) => ({ source: "ruled", company: c }),
    recognize: (c) => (c.domain === "careers-example.test" ? { slug: "ruled" } : null),
  };
  const full = createRegistry([...REAL, rule]);
  // With it: set up directly, no request.
  let stub = stubFetch404();
  try {
    const direct = await detectCompany(careers, {}, full);
    assert.equal(direct.atsPlatform, "ruled");
    assert.equal(direct.scrapeStatus, "ok");
    assert.equal(stub.calls(), 0);
  } finally {
    stub.restore();
  }
  // Without it: probed like any company; nothing found.
  const reduced = createRegistry(REAL.filter((a) => !a.recognize));
  assert.deepEqual(reduced.supportedSources().map((s) => s.id), REAL.filter((a) => !a.recognize).map((a) => a.id));
  stub = stubFetch404();
  try {
    const result = await detectCompany(careers, {}, reduced);
    assert.equal(result.scrapeStatus, "no_source");
    assert.equal(result.atsPlatform, null);
    assert.ok(stub.calls() > 0, "it was probed on the ATS platforms");
  } finally {
    stub.restore();
  }
  // The other adapters are untouched.
  assert.equal(reduced.getAdapter("greenhouse").id, "greenhouse");
  assert.equal(reduced.recognize(careers), null);
});

test("a fake adapter list works the same way", async () => {
  const fake = (id, extra = {}) => ({
    id, name: id.toUpperCase(), fetchJobs: async () => [], rawId: (r) => r.n, normalize: (r, c) => ({ source: id, company: c }), ...extra,
  });
  const reg = createRegistry([
    fake("alpha", { probe: { url: (s) => `https://alpha.test/${s}`, extract: (d) => (Array.isArray(d) ? d : null) } }),
    fake("beta", { recognize: (c) => (c.domain === "beta.test" ? { slug: "b" } : null) }),
  ]);
  assert.deepEqual(reg.supportedSources(), [{ id: "alpha", name: "ALPHA" }, { id: "beta", name: "BETA" }]);
  assert.equal((await detectCompany({ name: "B", domain: "beta.test" }, {}, reg)).atsPlatform, "beta");
  const stub = stubFetch404();
  try {
    assert.equal((await detectCompany({ name: "Other", domain: "other.test" }, {}, reg)).scrapeStatus, "no_source");
  } finally {
    stub.restore();
  }
});

test("a stored source that is not registered is unsupported: no crash, logged once, re-detected", async () => {
  updateState((s) => ({
    ...s,
    watchlist: [{ id: "g1", name: "Ghost Co", domain: "ghost.test", isCustom: false, addedAt: "2026-10-01T00:00:00Z" }],
    companyMeta: { g1: { atsPlatform: "ghostsource", atsSlug: "ghost", scrapeStatus: "ok" } },
  }));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const first = await runScrape({ companyIds: ["g1"] });
    const second = await runScrape({ companyIds: ["g1"] });
    assert.equal(first.report[0].status, "skipped");
    assert.equal(first.okSources, 0);
    assert.equal(first.errorSources, 0, "unsupported is not a failure");
    assert.equal(first.failed, false);
    assert.equal(second.report[0].status, "skipped");
    assert.equal(warnings.filter((w) => w.includes("ghostsource")).length, 1, "logged once");
    assert.equal(await scrapeOthersCompany({ name: "G", domain: "g.test", atsPlatform: "ghostsource", atsSlug: "g" }, "others:g.test", []), null);
  } finally {
    console.warn = originalWarn;
  }
  // detect:ats picks the company up again, so it ends as a normal detection.
  assert.deepEqual(shouldProcess({ id: "g1", name: "Ghost Co", domain: "ghost.test" }, { atsPlatform: "ghostsource", scrapeStatus: "ok" }, false), { process: true });
  assert.equal(shouldProcess({ id: "x", name: "X", domain: "x.test" }, { atsPlatform: "lever", scrapeStatus: "ok" }, false).process, false);
});

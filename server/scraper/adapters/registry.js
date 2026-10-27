// The one place careers-source adapters are registered. detect.js, fetchJobs.js and curateOthers.js
// read only this module.
//
// An adapter is a self-contained file in this folder with this shape:
//   id            "greenhouse"; stored as companyMeta.atsPlatform and in `source` on every job
//   name          display name ("Greenhouse"), shown by `npm run list:sources`
//   recognize?    (company) -> { slug, note? } | null. A domain rule for a source with no board to
//                 probe: the company is set up directly. Checked before any probing.
//   probe?        { url(slug), extract(data) -> array | null, verifyName?(slug, companyName) } for a
//                 source found by trying slug candidates (see detect.js). Probe order = list order.
//   fetchJobs     async (slug) -> raw jobs. Any error, or a partial result, throws.
//   rawId         (raw) -> id. The job id is <companyId>:<rawId> unless `jobId` is given.
//   jobId?        (raw, company) -> the whole job id (a source with a fixed id format)
//   normalize     (raw, company) -> the stored job fields
//   dryRun?       async () -> void. Fetches and prints a sample, writes nothing (`fetch:jobs --dry-run <id>`)
//
// To add a source: add its file and one line below. To drop one from an export: delete its file and
// its line. Nothing else names an adapter.

const ADAPTER_FILES = [
  "greenhouse",
  "lever",
  "ashby",
];

const REQUIRED = ["id", "name", "fetchJobs", "rawId", "normalize"];

/** Checks an adapter's shape; throws a clear error naming what is wrong. */
export function assertAdapter(adapter, label = "adapter") {
  for (const key of REQUIRED) {
    if (adapter?.[key] === undefined || adapter?.[key] === null) throw new Error(`${label}: missing "${key}"`);
  }
  if (typeof adapter.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(adapter.id)) throw new Error(`${label}: bad id "${adapter.id}"`);
  for (const key of ["fetchJobs", "rawId", "normalize"]) {
    if (typeof adapter[key] !== "function") throw new Error(`${label} "${adapter.id}": "${key}" must be a function`);
  }
  for (const key of ["recognize", "jobId", "dryRun"]) {
    if (adapter[key] !== undefined && typeof adapter[key] !== "function") throw new Error(`${label} "${adapter.id}": "${key}" must be a function`);
  }
  if (!adapter.recognize && !adapter.probe) throw new Error(`${label} "${adapter.id}": needs "recognize" or "probe" to be found`);
  if (adapter.probe && (typeof adapter.probe.url !== "function" || typeof adapter.probe.extract !== "function")) {
    throw new Error(`${label} "${adapter.id}": probe needs url() and extract()`);
  }
  return adapter;
}

/** A registry over a list of adapters (the real list below, or a fake one in tests). */
export function createRegistry(adapters) {
  const list = adapters.map((a, i) => assertAdapter(a, `adapter ${i}`));
  const ids = new Set();
  for (const a of list) {
    if (ids.has(a.id)) throw new Error(`duplicate adapter id "${a.id}"`);
    ids.add(a.id);
  }
  const byId = new Map(list.map((a) => [a.id, a]));
  const warned = new Set();

  return {
    /** All adapters, in registration order. */
    adapters: () => [...list],
    /** The adapter for a stored platform id, or null when none is registered (an old store). */
    getAdapter: (id) => byId.get(id) ?? null,
    /** The sources ApplyMate supports: [{ id, name }], in registration order. */
    supportedSources: () => list.map(({ id, name }) => ({ id, name })),
    /** Adapters found by probing slug candidates, in probe order. */
    probeAdapters: () => list.filter((a) => a.probe),
    /**
     * A source that recognises this company by itself (a domain rule), or null.
     * Returns { adapter, slug, note }.
     */
    recognize(company) {
      for (const adapter of list) {
        const hit = adapter.recognize?.(company);
        if (hit) return { adapter, slug: hit.slug, note: hit.note ?? null };
      }
      return null;
    },
    /**
     * Logs once per platform id that a store names a source this build doesn't have, and returns
     * true when the id is registered. Callers treat false as "unsupported", never as a failure.
     */
    isSupported(id) {
      if (byId.has(id)) return true;
      if (id && !warned.has(id)) {
        warned.add(id);
        console.warn(`[sources] "${id}" is not a supported source in this build; companies stored with it are skipped.`);
      }
      return false;
    },
  };
}

const modules = await Promise.all(ADAPTER_FILES.map((file) => import(`./${file}.js`)));
const registry = createRegistry(modules.map((m) => m.default));

export default registry;
export const { adapters, getAdapter, supportedSources, probeAdapters, recognize, isSupported } = registry;

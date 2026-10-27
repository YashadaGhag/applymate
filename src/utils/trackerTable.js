// Plain-code helpers for the Application Tracker and Saved Jobs tables: stat cards, search,
// filter, sort, dates. No React, no I/O, so they can be tested directly (trackerTable.test.js).

export const PAGE_SIZE = 12;

// ─── Statuses ────────────────────────────────────────────────────────────────

// Progress order, used when sorting by status.
export const STATUS_ORDER = ["pending", "applied", "interviewing", "offer", "not_moving_forward"];

// How each status reads on screen ("pending" is "Application pending").
export const STATUS_LABELS = {
  pending: "Application pending",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  not_moving_forward: "Not moving forward",
};

// ─── Stat cards ──────────────────────────────────────────────────────────────

/** Monday 00:00 local time of the week containing `now`. */
export function startOfWeek(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday);
  return start;
}

/**
 * The four Tracker stats, computed from the application records:
 *  - total: records at applied or later (pending doesn't count; archived does)
 *  - interviewing: status interviewing and not archived
 *  - responseRate: (interviewing + offer + not_moving_forward) / (applied + those three), a whole
 *    number percent, 0 when there are none
 *  - thisWeek: records whose appliedAt is on or after Monday 00:00 local time this week
 */
export function computeStats(applications, now = new Date()) {
  const count = (status) => applications.filter((a) => a.status === status).length;
  const applied = count("applied");
  const interviewing = count("interviewing");
  const responded = interviewing + count("offer") + count("not_moving_forward");
  const total = applied + responded;
  const weekStart = startOfWeek(now).getTime();
  return {
    total,
    interviewing: applications.filter((a) => a.status === "interviewing" && !a.archived).length,
    responseRate: total === 0 ? 0 : Math.round((responded / total) * 100),
    thisWeek: applications.filter((a) => a.appliedAt && new Date(a.appliedAt).getTime() >= weekStart).length,
  };
}

// ─── Dates and pay ───────────────────────────────────────────────────────────

/** 10/12/2026, or "-" when there is no date. */
export function formatTableDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

/**
 * A comparable number from a pay display text ("$160k - $210k", "$40 - $55/hr"): the low end, with
 * hourly pay scaled to a year, or null when there is nothing to compare.
 */
export function salaryValue(text) {
  const match = typeof text === "string" ? text.match(/(\d[\d,.]*)\s*(k)?/i) : null;
  if (!match) return null;
  const amount = parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(amount)) return null;
  const yearly = match[2] ? amount * 1000 : amount;
  return /\/hr/i.test(text) ? yearly * 2080 : yearly;
}

// ─── Search and sort ─────────────────────────────────────────────────────────

/** Case-insensitive match against company name or job title. An empty query matches everything. */
export function matchesSearch(row, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.company?.name, row.title].some((value) => typeof value === "string" && value.toLowerCase().includes(q));
}

/**
 * Sorts a copy of `rows` by `sort` ({ key, direction }) using `getters[key](row)`. A missing value
 * (null) always sorts last, whichever way the column is sorted.
 */
export function sortRows(rows, sort, getters) {
  const get = getters[sort.key];
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null);
    const order = typeof x === "string" ? x.localeCompare(y, "en", { sensitivity: "base" }) : x - y;
    return order * factor;
  });
}

/** The next sort after a header click: the same column flips, a new column starts ascending. */
export function nextSort(current, key) {
  if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: "asc" };
}

export function pageSlice(rows, page, pageSize = PAGE_SIZE) {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

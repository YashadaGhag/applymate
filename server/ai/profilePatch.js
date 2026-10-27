import { WORK_AUTH_OPTIONS } from "../../shared/workAuthOptions.js";
import { MAX_WEBSITES, websiteError } from "../../shared/websites.js";
import { isUsLocation } from "../../shared/location.js";

// The profile fields the Change Preferences > Details dialogs can edit, with the same limits and
// checks (the dialogs share the Role page's rules; the website and work authorization rules are
// imported from the same files the browser uses, so they can't drift).
const ALLOWED_KEYS = ["roles", "yearsOfExperience", "locations", "workTypes", "relocation", "workAuth", "websites"];
const MAX_CHIPS = 5;
const MIN_YEARS = 0;
const MAX_YEARS = 50;
const WORK_AUTH_VALUES = new Set(WORK_AUTH_OPTIONS.flatMap((group) => group.items));

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function fail(error) {
  return { ok: false, error };
}

/**
 * Checks a partial profile from the Details dialogs. Returns { ok: true, patch } (trimmed copies of
 * only the fields given) or { ok: false, error }. Never touches the stored profile.
 */
export function validateProfilePatch(input) {
  if (!isObject(input)) return fail("profilePatch must be an object.");
  const unknown = Object.keys(input).filter((k) => !ALLOWED_KEYS.includes(k));
  if (unknown.length) return fail(`profilePatch can't change: ${unknown.join(", ")}.`);

  const patch = {};

  if ("roles" in input) {
    if (!Array.isArray(input.roles) || input.roles.some((r) => typeof r !== "string")) return fail("roles must be a list of text.");
    const roles = input.roles.map((r) => r.trim()).filter(Boolean);
    if (roles.length > MAX_CHIPS) return fail(`At most ${MAX_CHIPS} designations.`);
    if (new Set(roles.map((r) => r.toLowerCase())).size !== roles.length) return fail("Designations can't repeat.");
    patch.roles = roles;
  }

  if ("yearsOfExperience" in input) {
    const years = input.yearsOfExperience;
    if (years !== null && !(Number.isInteger(years) && years >= MIN_YEARS && years <= MAX_YEARS)) {
      return fail(`yearsOfExperience must be a whole number from ${MIN_YEARS} to ${MAX_YEARS}.`);
    }
    patch.yearsOfExperience = years;
  }

  if ("locations" in input) {
    const locations = input.locations;
    if (!Array.isArray(locations) || locations.length > MAX_CHIPS) return fail(`locations must be a list of at most ${MAX_CHIPS} places.`);
    if (locations.some((l) => !isObject(l) || typeof l.label !== "string" || !l.label.trim())) return fail("Each location needs a label.");
    if (new Set(locations.map((l) => l.label.trim().toLowerCase())).size !== locations.length) return fail("Locations can't repeat.");
    patch.locations = locations;
  }

  if ("workTypes" in input) {
    const w = input.workTypes;
    const keys = ["remote", "onsite", "hybrid"];
    if (!isObject(w) || Object.keys(w).some((k) => !keys.includes(k)) || keys.some((k) => typeof w[k] !== "boolean")) {
      return fail("workTypes must be { remote, onsite, hybrid } as true or false.");
    }
    patch.workTypes = { remote: w.remote, onsite: w.onsite, hybrid: w.hybrid };
  }

  if ("relocation" in input) {
    if (input.relocation !== "yes" && input.relocation !== "no") return fail('relocation is required: "yes" or "no".');
    patch.relocation = input.relocation;
  }

  if ("workAuth" in input) {
    if (input.workAuth !== null && !WORK_AUTH_VALUES.has(input.workAuth)) return fail("workAuth isn't one of the listed statuses.");
    patch.workAuth = input.workAuth;
  }

  if ("websites" in input) {
    const s = input.websites;
    if (!isObject(s) || typeof s.linkedin !== "string" || typeof s.portfolio !== "string" || !Array.isArray(s.additional) || s.additional.some((u) => typeof u !== "string")) {
      return fail("websites must be { linkedin, portfolio, additional[] } as text.");
    }
    const linkedin = s.linkedin.trim();
    const portfolio = s.portfolio.trim();
    const additional = s.additional.map((u) => u.trim()).filter(Boolean);
    if ([linkedin, portfolio, ...additional].filter(Boolean).length > MAX_WEBSITES) return fail(`At most ${MAX_WEBSITES} websites.`);
    const problem =
      websiteError("linkedin", linkedin) ??
      websiteError("portfolio", portfolio) ??
      additional.map((u) => websiteError("other", u)).find(Boolean);
    if (problem) return fail(problem);
    patch.websites = { linkedin, portfolio, additional };
  }

  return { ok: true, patch };
}

/**
 * The stored profile with `patch` merged in. Work authorization is a US question: with no US
 * location left it is saved as empty (the Role page and the Details location dialog do the same).
 */
export function mergeProfile(profile, patch) {
  const merged = { ...(profile ?? {}), ...patch };
  if ("locations" in patch && !patch.locations.some((l) => isUsLocation(l))) merged.workAuth = null;
  return merged;
}

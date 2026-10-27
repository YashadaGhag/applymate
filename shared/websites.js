// Website rows for the Role page and the Change Preferences websites modal.

export const WEBSITE_LABELS = { linkedin: "LinkedIn", portfolio: "Portfolio", other: "Website" };
export const MAX_WEBSITES = 5;

export function parseWebsite(value) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

// Returns an error message for a non-empty value that isn't a web address, else null.
// Accepts "linkedin.com/in/name" as well as full https:// URLs. Empty rows are dropped on save.
export function websiteError(kind, raw) {
  const value = raw.trim();
  if (!value) return null;
  if (value.includes("@")) return "Enter a web address, not an email.";
  const url = /\s/.test(value) ? null : parseWebsite(value);
  if (!url || !/^https?:$/.test(url.protocol) || !/\.[a-z]{2,}$/i.test(url.hostname)) {
    return "Enter a valid web address, e.g. example.com";
  }
  if (kind === "linkedin" && !/(^|\.)linkedin\.com$/i.test(url.hostname)) {
    return "Enter a LinkedIn URL, e.g. linkedin.com/in/your-name";
  }
  return null;
}

// Stored shape is { linkedin, portfolio, additional[] }; the UI edits a flat list of rows
// so only websites that exist are shown (no empty LinkedIn/Portfolio placeholders).
let nextWebsiteId = 0;

export function newWebsiteRow() {
  return { id: nextWebsiteId++, kind: "other", value: "", touched: false };
}

export function websitesToRows({ linkedin, portfolio, additional } = {}) {
  return [
    ...(linkedin ? [{ kind: "linkedin", value: linkedin }] : []),
    ...(portfolio ? [{ kind: "portfolio", value: portfolio }] : []),
    ...(additional ?? []).filter(Boolean).map((value) => ({ kind: "other", value })),
  ].map((row) => ({ ...row, id: nextWebsiteId++, touched: false }));
}

export function rowsToWebsites(rows) {
  const filled = rows.map((r) => ({ ...r, value: r.value.trim() })).filter((r) => r.value);
  const linkedin =
    filled.find((r) => r.kind === "linkedin") ??
    // A LinkedIn URL typed into a generic row fills the LinkedIn slot if it's free.
    filled.find(
      (r) => r.kind === "other" && /(^|\.)linkedin\.com$/i.test(parseWebsite(r.value)?.hostname ?? "")
    );
  const portfolio = filled.find((r) => r.kind === "portfolio");
  return {
    linkedin: linkedin?.value ?? "",
    portfolio: portfolio?.value ?? "",
    additional: filled.filter((r) => r !== linkedin && r !== portfolio).map((r) => r.value),
  };
}

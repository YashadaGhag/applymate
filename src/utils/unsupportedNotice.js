// The notice on Change Preferences > Company Watchlist for companies we can't check yet (Figma
// "Change Preferences - company watchlist - Unsupported notice"). Pure functions over the watchlist
// and companyMeta, so they are tested without a browser.
//
// "Unsupported" is detection finding no supported careers source (companyMeta.scrapeStatus
// "no_source", recorded with noSourceAt). It is not a failure: these companies stay on the list, are
// never re-probed, and never appear in the loader's "not checked" list or the failed banner. The
// notice is not dismissible and stores nothing (the "N more" link opens a list of the same companies,
// UnsupportedCompaniesModal): it shows while at least one watchlist company is
// unsupported and goes away when none are. (Stores written by the earlier one-time version may carry
// companyMeta[id].noSourceNoticeSeenAt; it is ignored.)

/** The watchlist companies with no supported source, in watchlist order. */
export function unsupportedCompanies(watchlist, companyMeta) {
  return (watchlist ?? []).filter((company) => companyMeta?.[company.id]?.scrapeStatus === "no_source");
}

/** The banner names at most this many companies; with more, the rest become an "N more" link. */
export const NAMED_IN_BANNER = 2;

/**
 * The banner sentence in three parts, so "N more" can be a link: { before, link, after }.
 * `link` is null with one or two companies (their names are in the sentence) and "N more" with three
 * or more, where N is the count beyond the two named.
 *   1: We can’t check Acme Robotics for roles yet. It stays on your list.
 *   2: We can’t check Acme Robotics and Northwind Labs for roles yet. They stay on your list.
 *   3+: We can’t check Acme Robotics, Northwind Labs and [2 more] for roles yet. They stay on your list.
 * (the two-company line is Figma's; the other two follow it)
 */
export function unsupportedNoticeParts(names) {
  const none = { before: "", link: null, after: "" };
  if (names.length === 0) return none;
  if (names.length === 1) return { before: `We can’t check ${names[0]} for roles yet. It stays on your list.`, link: null, after: "" };
  if (names.length === NAMED_IN_BANNER) {
    return { before: `We can’t check ${names[0]} and ${names[1]} for roles yet. They stay on your list.`, link: null, after: "" };
  }
  return {
    before: `We can’t check ${names[0]}, ${names[1]} and `,
    link: `${names.length - NAMED_IN_BANNER} more`,
    after: " for roles yet. They stay on your list.",
  };
}

/** The whole sentence as plain text (the link text included). */
export function unsupportedNoticeText(names) {
  const { before, link, after } = unsupportedNoticeParts(names);
  return before + (link ?? "") + after;
}

/** The watchlist after one company is removed (the same list the watchlist save writes). */
export function withoutCompany(watchlist, id) {
  return (watchlist ?? []).filter((company) => company.id !== id);
}

/** The modal stays open while at least one unsupported company is left, and closes with the last. */
export function modalVisible(open, unsupported) {
  return Boolean(open) && unsupported.length > 0;
}

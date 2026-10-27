// Watchlist list helpers shared by the context and the Change Preferences dialog.

// Companies are the same when their domain matches (or their name, for custom ones).
export const dedupeKey = (c) => (c.domain ? c.domain.toLowerCase() : c.name.toLowerCase());

/** The list with `company` added (id and addedAt made here), or unchanged if it's already there. */
export function withCompany(list, company) {
  if (list.some((c) => dedupeKey(c) === dedupeKey(company))) return list;
  return [...list, { id: crypto.randomUUID(), addedAt: new Date().toISOString(), ...company }];
}

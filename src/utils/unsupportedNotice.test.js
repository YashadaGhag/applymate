// Run with: node --test src/utils/unsupportedNotice.test.js
// Which companies the notice names, and its strings: no browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unsupportedCompanies, unsupportedNoticeText, unsupportedNoticeParts, withoutCompany, modalVisible } from "./unsupportedNotice.js";

const company = (id, name = `Co ${id}`) => ({ id, name });
const NO_SOURCE = { scrapeStatus: "no_source", noSourceAt: "2026-10-21T17:00:00.000Z" };

test("only watchlist companies with no supported source are named, in list order", () => {
  const watchlist = [company("a"), company("b"), company("c"), company("d"), company("e")];
  const meta = {
    a: NO_SOURCE,
    b: { scrapeStatus: "ok" },
    c: { scrapeStatus: "error" }, // a failure is not "unsupported"
    // d: no entry yet (still being detected)
    e: NO_SOURCE,
  };
  assert.deepEqual(unsupportedCompanies(watchlist, meta).map((c) => c.id), ["a", "e"]);
});

test("a company that is not on the watchlist is never named, and empty inputs are fine", () => {
  assert.deepEqual(unsupportedCompanies([company("a")], { zzz: NO_SOURCE }), []);
  assert.deepEqual(unsupportedCompanies([], {}), []);
  assert.deepEqual(unsupportedCompanies(undefined, undefined), []);
});

test("nothing is stored: the notice follows the current state, and the old dismissal field is ignored", () => {
  const watchlist = [company("a"), company("b")];
  const old = { ...NO_SOURCE, noSourceNoticeSeenAt: "2026-10-21T18:00:00.000Z" };
  // An old store that still carries the one-time stamp: the company is named anyway.
  assert.deepEqual(unsupportedCompanies(watchlist, { a: old, b: { scrapeStatus: "ok" } }).map((c) => c.id), ["a"]);
  // It goes away when no company is unsupported any more (e.g. the company was removed).
  assert.deepEqual(unsupportedCompanies([company("b")], { a: old, b: { scrapeStatus: "ok" } }), []);
  // A removed and re-added company has a new id and is named from its own record.
  assert.deepEqual(unsupportedCompanies([company("a2")], { a2: NO_SOURCE }).map((c) => c.id), ["a2"]);
});

test("the strings: one, two (Figma), three and more", () => {
  assert.equal(unsupportedNoticeText([]), "");
  assert.equal(unsupportedNoticeText(["Acme Robotics"]), "We can’t check Acme Robotics for roles yet. It stays on your list.");
  assert.equal(
    unsupportedNoticeText(["Acme Robotics", "Northwind Labs"]),
    "We can’t check Acme Robotics and Northwind Labs for roles yet. They stay on your list."
  );
  assert.equal(
    unsupportedNoticeText(["Acme Robotics", "Northwind Labs", "Globex"]),
    "We can’t check Acme Robotics, Northwind Labs and 1 more for roles yet. They stay on your list."
  );
  assert.equal(
    unsupportedNoticeText(["Acme Robotics", "Northwind Labs", "Globex", "Initech"]),
    "We can’t check Acme Robotics, Northwind Labs and 2 more for roles yet. They stay on your list."
  );
});

test('the "N more" link exists only with three or more companies', () => {
  const names = (n) => Array.from({ length: n }, (_, i) => `Co ${i}`);
  assert.equal(unsupportedNoticeParts(names(0)).link, null);
  assert.equal(unsupportedNoticeParts(names(1)).link, null);
  assert.equal(unsupportedNoticeParts(names(2)).link, null);
  assert.equal(unsupportedNoticeParts(names(3)).link, "1 more");
  assert.equal(unsupportedNoticeParts(names(9)).link, "7 more");
  // With a link the sentence reads the same as before around it.
  const p = unsupportedNoticeParts(["A", "B", "C", "D"]);
  assert.equal(p.before + p.link + p.after, "We can’t check A, B and 2 more for roles yet. They stay on your list.");
  assert.equal(unsupportedNoticeText(["A", "B", "C", "D"]), p.before + p.link + p.after);
});

test("one shared list feeds the banner and the modal; it excludes failed scrapes and follows a removal live", () => {
  const watchlist = ["a", "b", "c", "d", "e"].map((id) => company(id));
  const meta = { a: NO_SOURCE, b: NO_SOURCE, c: { scrapeStatus: "error" }, d: NO_SOURCE, e: { scrapeStatus: "ok" } };
  let list = watchlist;
  let shared = unsupportedCompanies(list, meta);
  assert.deepEqual(shared.map((c) => c.id), ["a", "b", "d"], "a failed scrape (c) and a working one (e) are not in it");
  // The banner names the first two and links the rest; the modal lists all three.
  assert.equal(unsupportedNoticeParts(shared.map((c) => c.name)).link, "1 more");
  assert.equal(modalVisible(true, shared), true);

  // Remove one: banner and modal both read the new list; the link is gone, the modal is still open.
  list = withoutCompany(list, "a");
  shared = unsupportedCompanies(list, meta);
  assert.deepEqual(shared.map((c) => c.id), ["b", "d"]);
  assert.equal(unsupportedNoticeParts(shared.map((c) => c.name)).link, null);
  assert.equal(modalVisible(true, shared), true);
  assert.equal(list.length, 4, "the count line follows the same list");

  // Remove the last unsupported ones: the modal closes and the banner has nothing to say.
  list = withoutCompany(withoutCompany(list, "b"), "d");
  shared = unsupportedCompanies(list, meta);
  assert.deepEqual(shared, []);
  assert.equal(modalVisible(true, shared), false);
  assert.equal(unsupportedNoticeText(shared.map((c) => c.name)), "");
  assert.deepEqual(list.map((c) => c.id), ["c", "e"], "other companies are untouched");
});

import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLocation } from "./locationSummary.js";

const profile = {
  roles: ["Product Designer"],
  locations: [{ label: "Bellevue, WA", city: "Bellevue", region: "WA", country: "United States", countryCode: "US" }],
  workTypes: { remote: false, hybrid: true, onsite: true },
  relocation: false,
};

test("one location shows no count and keeps the posting's wording", () => {
  const s = summarizeLocation({ location: "Bellevue, Washington" }, profile);
  assert.deepEqual(s, { all: ["Bellevue, Washington"], lead: "Bellevue, Washington", more: 0 });
});

test("several locations: first listed leads when none fits, count of the rest", () => {
  const s = summarizeLocation({ location: "Austin, TX; Miami, FL; Boston, MA" }, profile);
  assert.equal(s.lead, "Austin, TX");
  assert.equal(s.more, 2);
});

test("the location that passes the profile leads", () => {
  const s = summarizeLocation({ location: "Austin, TX; Seattle, WA; Miami, FL" }, profile);
  assert.equal(s.lead, "Seattle, WA");
  assert.equal(s.more, 2);
  assert.deepEqual(s.all, ["Austin, TX", "Seattle, WA", "Miami, FL"]);
});

test("repeats count once; no location is empty", () => {
  assert.equal(summarizeLocation({ location: "Seattle, WA; seattle, wa" }, profile).more, 0);
  assert.deepEqual(summarizeLocation({ location: null }, profile), { all: [], lead: null, more: 0 });
});

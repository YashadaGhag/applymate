// Run with: node --test src/utils/roleSuggestions.test.js
// The designation dropdown: merge order, dedupe, selected roles left out, the failure fallback and
// "newest answer wins". No browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRoleSuggestions, safeRoleSuggestions, latestOnly } from "./roleSuggestions.js";
import { matchesWordStarts, typedTokens } from "../../shared/wordStartMatch.js";

const server = ["Software Engineer", "Product Manager", "Product Designer", "UX Designer", "Account Executive"];

test("nothing typed: resume roles first, then the server's top suggestions", () => {
  const out = mergeRoleSuggestions({ resumeRoles: ["UX Designer", "Interaction Designer"], server });
  assert.deepEqual(out, ["UX Designer", "Interaction Designer", "Software Engineer", "Product Manager", "Product Designer", "Account Executive"]);
});

test("duplicates are removed ignoring case; the resume spelling wins", () => {
  const out = mergeRoleSuggestions({ resumeRoles: ["product designer"], server });
  assert.equal(out.filter((t) => t.toLowerCase() === "product designer").length, 1);
  assert.equal(out[0], "product designer");
});

test("roles already selected are left out, ignoring case, from both parts", () => {
  const out = mergeRoleSuggestions({
    resumeRoles: ["UX Designer", "Visual Designer"],
    server,
    selected: ["ux designer", "Product Manager"],
  });
  assert.deepEqual(out, ["Visual Designer", "Software Engineer", "Product Designer", "Account Executive"]);
});

test("typed text keeps titles that match at the start of a word, resume roles still first", () => {
  const out = mergeRoleSuggestions({ resumeRoles: ["Interaction Designer", "Researcher"], server, typed: "design" });
  assert.deepEqual(out, ["Interaction Designer", "Product Designer", "UX Designer"]);
  assert.deepEqual(mergeRoleSuggestions({ resumeRoles: [], server, typed: "prod des" }), ["Product Designer"]);
  // A stale server answer for an earlier text can't show titles that no longer fit.
  assert.deepEqual(mergeRoleSuggestions({ resumeRoles: [], server: ["Software Engineer"], typed: "ux" }), []);
  assert.deepEqual(mergeRoleSuggestions({ resumeRoles: [], server, typed: "  " }).length, server.length);
});

test("word-start matching is shared: never mid-word, regex characters are literal", () => {
  assert.equal(matchesWordStarts("Redesign Lead", typedTokens("design")), false);
  assert.equal(matchesWordStarts("Design Systems", typedTokens("design")), true);
  assert.equal(matchesWordStarts("Product Designer", typedTokens("des prod")), false, "in order");
  assert.equal(matchesWordStarts("Product Designer", typedTokens(".")), false);
});

test("a failed request gives no server suggestions and the resume roles still show", async () => {
  const failing = async () => {
    throw new Error("network down");
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await safeRoleSuggestions("ux", failing), []);
  } finally {
    console.warn = warn;
  }
  const out = mergeRoleSuggestions({ resumeRoles: ["UX Designer"], server: await safeRoleSuggestions("", async () => []) });
  assert.deepEqual(out, ["UX Designer"]);
  assert.deepEqual(await safeRoleSuggestions("ux", async () => ["UX Designer"]), ["UX Designer"]);
});

test("a slow response never overwrites a newer one", async () => {
  const newest = latestOnly();
  const applied = [];
  let releaseSlow;
  const slow = new Promise((resolve) => {
    releaseSlow = () => resolve(["old answer"]);
  });
  const first = newest(slow, (r) => applied.push(r));
  const second = newest(Promise.resolve(["new answer"]), (r) => applied.push(r));
  await second;
  releaseSlow();
  await first;
  assert.deepEqual(applied, [["new answer"]]);
});

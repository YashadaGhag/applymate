// Run with: node --test shared/linkUrl.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedHref, normalizeLinkInput, MAX_LINK_CHARS } from "./linkUrl.js";

const href = (input) => {
  const r = normalizeLinkInput(input);
  return r.ok ? r.href : null;
};

test("https, http and mailto addresses are kept as typed (trimmed)", () => {
  assert.equal(href("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(href("  http://example.com  "), "http://example.com");
  assert.equal(href("HTTPS://Example.com"), "HTTPS://Example.com");
  assert.equal(href("mailto:jane@example.com"), "mailto:jane@example.com");
});

test("a bare address gets https://, a bare email gets mailto:", () => {
  assert.equal(href("portfolio.example.com"), "https://portfolio.example.com");
  assert.equal(href("www.example.com/work?x=1"), "https://www.example.com/work?x=1");
  assert.equal(href("example.com:8080/path"), "https://example.com:8080/path");
  assert.equal(href("localhost:5173"), "https://localhost:5173");
  assert.equal(href("jane@example.com"), "mailto:jane@example.com");
});

test("other schemes, relative paths and junk are refused with a message", () => {
  for (const bad of [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "\u0001javascript:alert(1)", "java\tscript:alert(1)",
    "data:text/html,hi", "vbscript:msgbox(1)", "file:///etc/passwd", "ftp://example.com", "tel:+15551234567",
    "//evil.example.com", "/path", "./path", "../path", "#top", "?q=1", "\\\\server\\share",
    "https://exam ple.com", "word", "two words.com", "", "   ", "https://", "mailto:",
  ]) {
    const r = normalizeLinkInput(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.error.length > 0);
  }
  assert.equal(normalizeLinkInput(null).ok, false);
});

test("isAllowedHref is strict about the very first character and about control characters", () => {
  assert.equal(isAllowedHref("https://example.com"), true);
  assert.equal(isAllowedHref("mailto:a@b.co"), true);
  for (const bad of [
    " https://example.com", "\thttps://example.com", "\u0001https://example.com", "https://exa\u0000mple.com",
    "javascript:alert(1)", "example.com", "", null, undefined, 5, "https://" + "a".repeat(MAX_LINK_CHARS),
  ]) {
    assert.equal(isAllowedHref(bad), false, JSON.stringify(bad));
  }
});

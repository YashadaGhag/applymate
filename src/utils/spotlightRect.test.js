import test from "node:test";
import assert from "node:assert/strict";
import { sameRect } from "./spotlightRect.js";

const rect = (top, left, width, height) => ({ top, left, width, height });

test("sameRect: equal boxes are the same", () => {
  assert.equal(sameRect(rect(10, 20, 300, 80), rect(10, 20, 300, 80)), true);
});

test("sameRect: a shifted box (the layout moved the target down) is different", () => {
  assert.equal(sameRect(rect(10, 20, 300, 80), rect(70, 20, 300, 80)), false);
});

test("sameRect: a resized box is different", () => {
  assert.equal(sameRect(rect(10, 20, 300, 80), rect(10, 20, 300, 120)), false);
});

test("sameRect: not measured yet", () => {
  assert.equal(sameRect(null, null), true);
  assert.equal(sameRect(null, rect(0, 0, 1, 1)), false);
  assert.equal(sameRect(rect(0, 0, 1, 1), null), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("hand limit picker measures the lane between copy and confirm", () => {
  const source = fs.readFileSync(new URL("../app/match-ui-guard.tsx", import.meta.url), "utf8");
  assert.match(source, /function layoutHandLimitChoices\(\)/);
  assert.match(source, /confirmRect \? confirmRect\.top/);
  assert.match(source, /--hand-limit-item-w/);
  assert.match(source, /bestColumns/);
});

test("hand limit cards are a bounded adaptive grid instead of overlapping actions", () => {
  const css = fs.readFileSync(new URL("../app/ui-overrides.css", import.meta.url), "utf8");
  assert.match(css, /hand-limit-choice-area\[data-hand-limit-fit/);
  assert.match(css, /repeat\(var\(--hand-limit-cols\), var\(--hand-limit-item-w\)\)/);
  assert.match(css, /max-height: var\(--hand-limit-max-h\)/);
  assert.match(css, /overflow: hidden/);
});

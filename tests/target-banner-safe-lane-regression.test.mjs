import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("target banner stays compact while centered inside measured safe lane", () => {
  const guard = fs.readFileSync(new URL("../app/match-ui-guard.tsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../app/ui-overrides.css", import.meta.url), "utf8");
  assert.match(guard, /function layoutTargetBannerInSafeLane\(\)/);
  assert.match(guard, /hero-command-bar/);
  assert.match(guard, /paired-field \.creature-slot/);
  assert.match(guard, /:scope > \.terrain-slot/);
  assert.match(guard, /--target-safe-center-x/);
  assert.match(guard, /--target-safe-center-y/);
  assert.match(css, /target-banner\[data-safe-lane-measured="true"\]/);
  assert.match(css, /width: max-content/);
  assert.match(css, /height: auto/);
  assert.match(css, /left: var\(--target-safe-center-x\)/);
  assert.match(css, /top: var\(--target-safe-center-y\)/);
  assert.match(css, /transform: translate\(-50%, -50%\)/);
  assert.doesNotMatch(css, /width: calc\(var\(--target-safe-right\) - var\(--target-safe-left\)\) !important;\n  height: calc/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("target banner uses measured relative safe-lane geometry", () => {
  const guard = fs.readFileSync(new URL("../app/match-ui-guard.tsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../app/ui-overrides.css", import.meta.url), "utf8");
  assert.match(guard, /function layoutTargetBannerInSafeLane\(\)/);
  assert.match(guard, /hero-command-bar/);
  assert.match(guard, /paired-field \.creature-slot/);
  assert.match(guard, /:scope > \.terrain-slot/);
  assert.match(guard, /--target-safe-left/);
  assert.match(guard, /--target-safe-bottom/);
  assert.match(css, /target-banner\[data-safe-lane-measured="true"\]/);
  assert.match(css, /width: calc\(var\(--target-safe-right\) - var\(--target-safe-left\)\)/);
  assert.match(css, /height: calc\(var\(--target-safe-bottom\) - var\(--target-safe-top\)\)/);
});

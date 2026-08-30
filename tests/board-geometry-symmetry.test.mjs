import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(new URL("../app/presentation/styles/board/board-layout.css", import.meta.url), "utf8");
const overrides = fs.readFileSync(new URL("../app/presentation/styles/base/ui-overrides.css", import.meta.url), "utf8");
const interactions = fs.readFileSync(new URL("../app/presentation/styles/board/lab-overrides.css", import.meta.url), "utf8");
const reference = fs.readFileSync(new URL("../app/presentation/styles/board/reference-board-layout.css", import.meta.url), "utf8");
const rootLayout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../app/presentation/match/match-ui-runtime.tsx", import.meta.url), "utf8");

test("the approved regions share one responsive vertical displacement", () => {
  assert.match(reference, /--hh-reference-shift-y: clamp\([^;]+cqh[^;]+\)/);
  for (const selector of ["enemy-energy", "player-energy", "enemy-field", "player-field", "enemy-terrain", "player-terrain", "enemy-piles", "player-piles", "hero-abilities.enemy", "hero-abilities:not(.enemy)"]) {
    assert.match(reference, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(reference, /translate: 0 var\(--hh-reference-shift-y\) !important/);
  assert.match(layout, /> \.enemy-energy \{ grid-column: 3 !important; grid-row: 3 !important; \}/);
  assert.match(layout, /> \.player-energy \{ grid-column: 3 !important; grid-row: 7 !important; \}/);
});

test("portrait mode contains the complete desktop composition", () => {
  assert.doesNotMatch(layout, /width: max\(62rem/);
  assert.match(reference, /@media \(orientation: portrait\)[\s\S]*?overflow: hidden !important/s);
  assert.match(reference, /@media \(orientation: portrait\)[\s\S]*?width: min\(100dvw, calc\(100dvh \* 16 \/ 9\)\) !important/s);
  assert.match(reference, /@media \(orientation: portrait\)[\s\S]*?height: min\(100dvh, calc\(100dvw \* 9 \/ 16\)\) !important/s);
  assert.match(rootLayout, /reference-board-layout\.css/);
});

test("floating match UI uses stable sectors of the responsive 16:9 board", () => {
  assert.match(reference, /--hh-board-center-y: calc\(50cqh \+ var\(--hh-reference-shift-y\)\)/);
  assert.match(reference, /--hh-stack-sector-y: calc\(52\.5cqh \+ var\(--hh-reference-shift-y\)\)/);
  assert.match(layout, /--hh-effect-rail-right: 16\.6cqw/);
  assert.match(layout, /width: min\(100dvw, calc\(100dvh \* 16 \/ 9\)\)/);
  assert.match(layout, /height: min\(100dvh, calc\(100dvw \* 9 \/ 16\)\)/);
  assert.match(interactions, /right: var\(--hh-effect-rail-right,16\.6cqw\)/);
  assert.match(interactions, /top: var\(--hh-board-center-y,50cqh\)/);
  assert.match(overrides, /top:var\(--hh-stack-sector-y,52\.5cqh\)/);
  assert.match(runtime, /const boardRect = board\.getBoundingClientRect\(\)/);
  assert.match(runtime, /positionCompactBanner\(board, normalTargetBanner, "left"\)/);
  assert.match(runtime, /--response-opponent-piles-top/);
});

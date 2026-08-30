import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(new URL("../app/presentation/styles/board/board-layout.css", import.meta.url), "utf8");
const overrides = fs.readFileSync(new URL("../app/presentation/styles/base/ui-overrides.css", import.meta.url), "utf8");
const interactions = fs.readFileSync(new URL("../app/presentation/styles/board/lab-overrides.css", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../app/presentation/match/match-ui-runtime.tsx", import.meta.url), "utf8");

const liftedRows = /minmax\(0,4\.5fr\)\s*minmax\(0,14\.5fr\)\s*minmax\(0,4fr\)\s*minmax\(0,24fr\)\s*minmax\(0,5fr\)\s*minmax\(0,29fr\)\s*minmax\(0,4fr\)\s*minmax\(0,15fr\)/s;

test("the battlefield is lifted while both energy gaps remain symmetrical", () => {
  assert.match(overrides, liftedRows);
  assert.match(overrides, />\.enemy-energy\{[^}]*align-self:center!important;[^}]*margin-top:0!important;[^}]*margin-bottom:0!important/s);
  assert.match(layout, /> \.enemy-energy \{ grid-column: 3 !important; grid-row: 3 !important; \}/);
  assert.match(layout, /> \.player-energy \{ grid-column: 3 !important; grid-row: 7 !important; \}/);
  assert.match(layout, /minmax\(0, 4fr\)[\s\S]*minmax\(0, 24fr\)[\s\S]*minmax\(0, 5fr\)[\s\S]*minmax\(0, 29fr\)[\s\S]*minmax\(0, 4fr\)/);
});

test("floating match UI uses stable sectors of the responsive 16:9 board", () => {
  assert.match(layout, /--hh-board-center-y: 50cqh/);
  assert.match(layout, /--hh-stack-sector-y: 52\.5cqh/);
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

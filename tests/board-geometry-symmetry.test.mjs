import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(new URL("../app/presentation/styles/board/board-layout.css", import.meta.url), "utf8");
const overrides = fs.readFileSync(new URL("../app/presentation/styles/base/ui-overrides.css", import.meta.url), "utf8");
const interactions = fs.readFileSync(new URL("../app/presentation/styles/board/lab-overrides.css", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../app/presentation/match/match-ui-runtime.tsx", import.meta.url), "utf8");
const guard = fs.readFileSync(new URL("../app/presentation/match/match-ui-guard.tsx", import.meta.url), "utf8");
const seal = fs.readFileSync(new URL("../app/presentation/styles/board/board-cascade-seal.css", import.meta.url), "utf8");
const rootLayout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

const liftedRows = /minmax\(0,4\.5fr\)\s*minmax\(0,7\.5fr\)\s*minmax\(0,4fr\)\s*minmax\(0,24fr\)\s*minmax\(0,5fr\)\s*minmax\(0,24fr\)\s*minmax\(0,4fr\)\s*minmax\(0,27fr\)/s;

test("the battlefield is lifted while both energy gaps remain symmetrical", () => {
  assert.match(seal.replace(/\s+/g, ""), liftedRows);
  assert.match(overrides, />\.enemy-energy\{[^}]*align-self:center!important;[^}]*margin-top:0!important;[^}]*margin-bottom:0!important/s);
  assert.match(seal, /> \.player-energy \{[^}]*grid-row: 7 !important;[^}]*align-self: center !important;[^}]*margin-top: 0 !important;[^}]*margin-bottom: 0 !important/s);
  assert.match(seal, /> \.enemy-energy \{[^}]*grid-row: 3 !important;[^}]*align-self: center !important;[^}]*margin-top: 0 !important;[^}]*margin-bottom: 0 !important/s);
  assert.match(seal, /:is\(\.player-field, \.player-terrain\) \{[^}]*align-self: end !important;[^}]*translateY\(-2\.5cqh\)/s);
  assert.match(seal, /> \.player-energy \{[^}]*translateY\(-2cqh\)/s);
  assert.match(rootLayout, /import "\.\/presentation\/styles\/command-bar-fixes\.css";[\s\S]*import "\.\/presentation\/styles\/board\/board-cascade-seal\.css";/s);
  assert.match(layout, /> \.enemy-energy \{ grid-column: 3 !important; grid-row: 3 !important; \}/);
  assert.match(layout, /> \.player-energy \{ grid-column: 3 !important; grid-row: 7 !important; \}/);
  assert.match(layout, /minmax\(0, 4fr\)[\s\S]*minmax\(0, 24fr\)[\s\S]*minmax\(0, 5fr\)[\s\S]*minmax\(0, 24fr\)[\s\S]*minmax\(0, 4fr\)/);
  assert.match(seal, /minmax\(0, 24fr\)[\s\S]*minmax\(0, 5fr\)[\s\S]*minmax\(0, 24fr\)/);
});

test("portrait mode keeps the board readable and pans on both axes", () => {
  assert.match(layout, /@media \(orientation: portrait\)[\s\S]*?overflow: auto !important/s);
  assert.match(layout, /@media \(orientation: portrait\)[\s\S]*?touch-action: pan-x pan-y/s);
  assert.match(layout, /@media \(orientation: portrait\)[\s\S]*?width: max\(62rem, calc\(120dvh \* 16 \/ 9\)\) !important/s);
  assert.match(layout, /@media \(orientation: portrait\)[\s\S]*?height: max\(34\.875rem, 120dvh\) !important/s);
  assert.match(layout, /@media \(orientation: portrait\)[\s\S]*?max-width: none !important/s);
  assert.match(guard, /stage\.scrollLeft = Math\.max\(0, \(stage\.scrollWidth - stage\.clientWidth\) \/ 2\)/);
  assert.match(guard, /stage\.scrollTop = Math\.max\(0, \(stage\.scrollHeight - stage\.clientHeight\) \/ 2\)/);
  assert.match(guard, /stage\.dataset\.hhMobilePan = "true"/);
  assert.match(layout, /game-stage\[data-hh-mobile-pan="true"\][\s\S]*?overflow: auto !important/s);
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

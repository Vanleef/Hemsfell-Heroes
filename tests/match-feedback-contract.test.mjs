import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/match-feedback-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/match-feedback-final.css", "utf8");
const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("defense decision sits left of terrain using the real terrain-to-field gap", () => {
  assert.match(runtime, /visibleRects\(board, ":scope > \.terrain-slot"\)/);
  assert.match(runtime, /visibleRects\(board, "\.paired-field \.field-slot"\)/);
  assert.match(runtime, /firstFieldLeftViewport = Math\.min/);
  assert.match(runtime, /firstFieldLeftViewport - referenceTerrain\.right/);
  assert.match(runtime, /decisionRightViewport = referenceTerrain[\s\S]*referenceTerrain\.left - terrainFieldGap/);
  assert.match(runtime, /dataset\.geometryAnchored = "left-of-terrain-reference-gap"/);
  assert.match(runtime, /gapTopViewport = enemyRect\.bottom \+ verticalGapPadding/);
  assert.match(runtime, /gapBottomViewport = playerRect\.top - verticalGapPadding/);
  assert.match(runtime, /:scope > \.terrain-slot\.enemy-terrain/);
  assert.match(runtime, /:scope > \.terrain-slot\.player-terrain/);
  assert.match(sheet, /\.defense-decision[^}]*position: absolute !important/);
});

test("priority strip is measured from the gap between enemy and player fields", () => {
  assert.match(runtime, /:scope > \.paired-field\.enemy-field/);
  assert.match(runtime, /:scope > \.paired-field\.player-field/);
  assert.match(runtime, /sharedLeft = Math\.max\(enemyRect\.left, playerRect\.left\)/);
  assert.match(runtime, /sharedRight = Math\.min\(enemyRect\.right, playerRect\.right\)/);
  assert.match(runtime, /upperRect\.bottom \+ \(lowerRect\.top - upperRect\.bottom\) \/ 2/);
  assert.match(runtime, /style\.setProperty\(PRIORITY_BAND_X/);
  assert.match(runtime, /style\.setProperty\(PRIORITY_BAND_Y/);
});

test("evolution availability is visible on the hero panel without a body portal dependency", () => {
  assert.match(runtime, /classList\.toggle\("evolution-ready", ready\)/);
  assert.match(runtime, /classList\.toggle\("evolution-available", available\)/);
  assert.match(runtime, /panel\.dataset\.evolutionAvailable = "true"/);
  assert.doesNotMatch(runtime, /document\.body\.appendChild/);
  assert.match(css, /:has\(> \.player-hero\.level-ready > \.level-button:not\(:disabled\)\)/);
  assert.match(css, /content: "EVOLUÇÃO DISPONÍVEL" !important/);
  assert.match(sheet, /player-hero\.level-ready > \.level-button[^}]*display: grid !important[^}]*opacity: 1 !important[^}]*visibility: visible !important/);
  assert.match(sheet, /player-hero\.level-ready > \.level-button:not\(:disabled\)[^}]*border-color: #f2ca58 !important/);
});

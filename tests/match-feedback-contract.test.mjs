import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/match-feedback-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/match-feedback-final.css", "utf8");
const criticalCss = fs.readFileSync("app/presentation/styles/critical-flow-feedback.css", "utf8");
const presentationCss = fs.readFileSync("app/presentation/styles/game-presentation.css", "utf8");
const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);
const criticalSheet = compact(criticalCss);
const presentationSheet = compact(presentationCss);

test("defense decision sits close to terrain using a reduced terrain-to-field reference gap", () => {
  assert.match(runtime, /visibleRects\(board, ":scope > \.terrain-slot"\)/);
  assert.match(runtime, /visibleRects\(board, "\.paired-field \.field-slot"\)/);
  assert.match(runtime, /firstFieldLeftViewport = Math\.min/);
  assert.match(runtime, /firstFieldLeftViewport - referenceTerrain\.right/);
  assert.match(runtime, /decisionTerrainGap = Math\.max\(6, Math\.min\(14, terrainFieldGap \* 0\.5\)\)/);
  assert.match(runtime, /decisionRightViewport = referenceTerrain[\s\S]*referenceTerrain\.left - decisionTerrainGap/);
  assert.match(runtime, /dataset\.geometryAnchored = "left-of-terrain-reference-gap"/);
  assert.match(runtime, /gapTopViewport = enemyRect\.bottom \+ verticalGapPadding/);
  assert.match(runtime, /gapBottomViewport = playerRect\.top - verticalGapPadding/);
  assert.match(runtime, /:scope > \.terrain-slot\.enemy-terrain/);
  assert.match(runtime, /:scope > \.terrain-slot\.player-terrain/);
  assert.match(sheet, /\.defense-decision[^}]*position: absolute !important/);
  assert.match(criticalSheet, /\.defense-decision[^}]*left: clamp\(5\.75rem, 8\.9cqw, 8\.6rem\) !important/);
});

test("defense choice keeps the board readable while spotlighting the declared attacker", () => {
  assert.match(criticalSheet, /hs-board:has\(> \.defense-decision\) > :not\(\.defense-decision\):not\(\.player-field\):not\(\.enemy-field\)[^}]*brightness\(\.58\)[^}]*opacity: \.78 !important/);
  assert.match(criticalSheet, /hs-board:has\(> \.defense-decision\) > \.enemy-field[^}]*filter: none !important[^}]*opacity: 1 !important/);
  assert.match(criticalSheet, /> \.enemy-field \.field-slot:not\(:has\(\.original-card\.is-selected\)\)[^}]*brightness\(\.58\)[^}]*opacity: \.78 !important/);
  assert.match(criticalSheet, /> \.enemy-field \.field-slot:has\(\.original-card\.is-selected\)[^}]*opacity: 1 !important[^}]*z-index: 2147482100 !important/);
  assert.match(criticalSheet, /> \.enemy-field \.original-card\.is-selected[^}]*brightness\(1\.12\)[^}]*outline:[^}]*box-shadow:/);
  assert.match(criticalSheet, /hs-board:has\(> \.defense-decision\) > \.player-field[^}]*brightness\(\.84\)[^}]*opacity: \.96 !important/);
  assert.match(criticalSheet, /\.defense-decision[^}]*animation: hh-defense-decision-attention 1\.05s ease-in-out infinite !important/);
  assert.match(criticalCss, /@keyframes hh-defense-decision-attention/);
  assert.match(criticalSheet, /response-overlay \.response-dialog[^}]*outline:[^}]*box-shadow:/);
});

test("hero level-up never replaces the responsive hero with the out-of-container hold clone", () => {
  assert.match(presentationSheet, /\.hh-presentation-hidden[^}]*opacity: 0 !important[^}]*visibility: hidden !important/);
  assert.match(criticalSheet, /\.hh-state-hold\.is-level-up-hold[^}]*display: none !important[^}]*visibility: hidden !important/);
  assert.match(criticalSheet, /body:has\(\.hh-state-hold\.is-level-up-hold\)[^}]*\.player-hero\.hh-presentation-hidden[^}]*opacity: 1 !important[^}]*visibility: visible !important[^}]*scale: 1 !important/);
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

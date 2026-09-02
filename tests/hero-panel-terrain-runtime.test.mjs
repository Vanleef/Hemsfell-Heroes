import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const geometryCss = fs.readFileSync("app/presentation/styles/hero-panel-layout-final.css", "utf8");
const balanceCss = fs.readFileSync("app/presentation/styles/hero-panel-visual-balance-final.css", "utf8");
const terminalCss = fs.readFileSync("app/presentation/styles/hero-panel-polish-terminal.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("Cruel Terrain is anchored to the first rendered owner slot with stable local dimensions", () => {
  assert.match(runtime, /const TERRAIN_GAP_MULTIPLIER = 2\.05/);
  assert.match(runtime, /const TERRAIN_MIN_SLOT_CLEARANCE = 0\.34/);
  assert.match(runtime, /\.field-slot\[data-slot="1"\]/);
  assert.match(runtime, /\.field-slot\[data-slot="2"\]/);
  assert.match(runtime, /secondRect\.left - firstRect\.right/);
  assert.match(runtime, /firstRect\.width \* TERRAIN_MIN_SLOT_CLEARANCE/);
  assert.match(runtime, /Math\.max\(measuredGap \* TERRAIN_GAP_MULTIPLIER, minimumSlotClearance, 10\)/);
  assert.match(runtime, /boardRect\.width \/ layoutWidth/);
  assert.match(runtime, /boardRect\.height \/ layoutHeight/);
  assert.match(runtime, /const slotWidth = geometry\.firstRect\.width \/ boardScale\.x/);
  assert.match(runtime, /const slotHeight = geometry\.firstRect\.height \/ boardScale\.y/);
  assert.match(runtime, /firstSlotLeft = \(geometry\.firstRect\.left - boardRect\.left\) \/ boardScale\.x/);
  assert.match(runtime, /clearance = geometry\.clearance \/ boardScale\.x/);
  assert.match(runtime, /fieldTop = \(fieldRect\.top - boardRect\.top\) \/ boardScale\.y/);
  assert.match(runtime, /fieldHeight = fieldRect\.height \/ boardScale\.y/);
  assert.match(runtime, /const x = firstSlotLeft - slotWidth - clearance/);
  assert.match(runtime, /const y = fieldTop \+ \(fieldHeight - slotHeight\) \/ 2/);
  assert.doesNotMatch(runtime, /terrainRect\.width \/ boardScale\.x/);
  assert.match(runtime, /is-field-anchored/);
  assert.match(geometryCss, /\.terrain-slot\.is-field-anchored/);
  assert.match(geometryCss, /left: var\(--terrain-anchor-x\)/);
  assert.match(geometryCss, /top: var\(--terrain-anchor-y\)/);
  assert.match(terminalCss, /terrain-slot\.is-field-anchored[^}]*visibility: visible !important[^}]*opacity: 1 !important/);
  assert.match(terminalCss, /terrain-slot\.is-field-anchored > \.card-frame[^}]*position: absolute !important[^}]*inset: 0 !important/);
  assert.match(layout, /<TerrainFieldAnchorRuntime \/>/);
});

test("hero artwork fills and slightly overscans its portrait band", () => {
  assert.match(geometryCss, /--hero-card-art-top: 0cqh/);
  assert.match(geometryCss, /hero-power-trigger[\s\S]*?left: 0 !important;[\s\S]*?right: 0 !important;[\s\S]*?width: 100% !important;/);
  assert.match(balanceCss, /hero-power-trigger > \.hero-portrait[\s\S]*?inset: -\.16cqh -\.12cqw !important;/);
  assert.match(balanceCss, /hero-portrait > img[\s\S]*?transform: scale\(1\.055\) !important;[\s\S]*?object-fit: cover !important;/);
});

test("expanded hero aligns identity progress and readable ability rows", () => {
  assert.match(balanceCss, /canonical-hero-panel\.is-expanded \{[\s\S]*?height: 47\.6cqh !important;/);
  assert.match(balanceCss, /hero-power-trigger > \.hero-life[\s\S]*?top: \.48cqh !important;[\s\S]*?bottom: auto !important;/);
  assert.match(terminalCss, /hero-short-name[\s\S]*?bottom: 1\.02cqh !important;[\s\S]*?text-align: center !important;/);
  assert.match(balanceCss, /canonical-hero-panel\.is-expanded > \.player-hero > \.hero-level-row[\s\S]*?top: var\(--hero-card-level-top\) !important;/);
  assert.match(balanceCss, /hero-ability-chip[\s\S]*?min-height: 4\.18cqh !important;[\s\S]*?padding: \.38cqh \.42cqw !important;/);
  assert.match(balanceCss, /hero-ability-copy > p[\s\S]*?line-height: 1\.17 !important;/);
  assert.match(balanceCss, /height: 46\.2cqh !important;/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hero-panel-visual-balance-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("Cruel Terrain keeps extra proportional clearance using rendered terrain size", () => {
  assert.match(runtime, /const TERRAIN_GAP_MULTIPLIER = 2\.05/);
  assert.match(runtime, /const TERRAIN_MIN_SLOT_CLEARANCE = 0\.34/);
  assert.match(runtime, /\.field-slot\[data-slot="1"\]/);
  assert.match(runtime, /\.field-slot\[data-slot="2"\]/);
  assert.match(runtime, /boardRect\.width \/ layoutWidth/);
  assert.match(runtime, /boardRect\.height \/ layoutHeight/);
  assert.match(runtime, /const terrainRect = terrainEl\.getBoundingClientRect\(\)/);
  assert.match(runtime, /const terrainWidth = terrainRect\.width \/ boardScale\.x/);
  assert.match(runtime, /const terrainHeight = terrainRect\.height \/ boardScale\.y/);
  assert.match(runtime, /firstRect\.width \* TERRAIN_MIN_SLOT_CLEARANCE/);
  assert.match(runtime, /Math\.max\(measuredGap \* TERRAIN_GAP_MULTIPLIER, minimumSlotClearance, 10\)/);
  assert.match(runtime, /const x = firstSlotLeft - terrainWidth - clearance/);
  assert.match(runtime, /const y = fieldTop \+ \(fieldHeight - terrainHeight\) \/ 2/);
});

test("hero portrait gets a responsive overscan instead of dead frame space", () => {
  assert.match(sheet, /hero-power-trigger > \.hero-portrait[^}]*inset: -\.16cqh -\.12cqw !important/);
  assert.match(sheet, /hero-power-trigger > \.hero-portrait > img[^}]*transform: scale\(1\.055\) !important/);
  assert.match(sheet, /object-fit: cover !important/);
});

test("hero identity uses symmetric top badges and centered bottom name", () => {
  assert.match(sheet, /hero-power-trigger > \.hero-life[^}]*top: \.48cqh !important[^}]*right: \.38cqw !important[^}]*bottom: auto !important/);
  assert.match(sheet, /hero-power-trigger > \.hero-short-name[^}]*left: 1\.05cqw !important[^}]*right: 1\.05cqw !important[^}]*bottom: \.38cqh !important/);
  assert.match(sheet, /hero-power-trigger > \.hero-short-name[^}]*text-align: center !important/);
});

test("expanded hero aligns portrait progress and readable ability rows", () => {
  assert.match(sheet, /canonical-hero-panel\.is-expanded[^}]*--hero-card-level-top: calc\(var\(--hero-card-art-top\) \+ var\(--hero-card-art-height\) \+ \.28cqh\)/);
  assert.match(sheet, /canonical-hero-panel\.is-expanded > \.player-hero > \.hero-level-row[^}]*top: var\(--hero-card-level-top\) !important/);
  assert.match(sheet, /hero-command-bar > \.hero-ability-chip[^}]*min-height: 4\.18cqh !important/);
  assert.match(sheet, /hero-command-bar > \.hero-ability-chip[^}]*column-gap: \.62cqw !important/);
  assert.match(sheet, /hero-ability-copy > p[^}]*line-height: 1\.17 !important/);
});

test("short landscape has its own compact but readable balance", () => {
  const landscape = css.slice(css.indexOf("@media (orientation: landscape)"));
  assert.match(landscape, /height: 46\.2cqh !important/);
  assert.match(landscape, /min-height: 3\.82cqh !important/);
  assert.match(landscape, /line-height: 1\.15 !important/);
});

test("visual balance stylesheet is the terminal hero CSS authority", () => {
  const geometry = layout.indexOf('import "./presentation/styles/hero-panel-layout-final.css"');
  const balance = layout.indexOf('import "./presentation/styles/hero-panel-visual-balance-final.css"');
  assert.ok(geometry >= 0 && balance > geometry);
});

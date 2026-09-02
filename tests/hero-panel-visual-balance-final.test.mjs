import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hero-panel-visual-balance-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("Cruel Terrain keeps extra proportional clearance and a stable field-slot footprint", () => {
  assert.match(runtime, /const TERRAIN_GAP_MULTIPLIER = 2\.05/);
  assert.match(runtime, /const TERRAIN_MIN_SLOT_CLEARANCE = 0\.34/);
  assert.match(runtime, /\.field-slot\[data-slot="1"\]/);
  assert.match(runtime, /\.field-slot\[data-slot="2"\]/);
  assert.match(runtime, /boardRect\.width \/ layoutWidth/);
  assert.match(runtime, /boardRect\.height \/ layoutHeight/);
  assert.match(runtime, /const slotWidth = geometry\.firstRect\.width \/ boardScale\.x/);
  assert.match(runtime, /const slotHeight = geometry\.firstRect\.height \/ boardScale\.y/);
  assert.match(runtime, /--terrain-anchor-width/);
  assert.match(runtime, /--terrain-anchor-height/);
  assert.match(runtime, /const terrainRect = terrainEl\.getBoundingClientRect\(\)/);
  assert.match(runtime, /const terrainWidth = terrainRect\.width \/ boardScale\.x/);
  assert.match(runtime, /const terrainHeight = terrainRect\.height \/ boardScale\.y/);
  assert.match(runtime, /firstRect\.width \* TERRAIN_MIN_SLOT_CLEARANCE/);
  assert.match(runtime, /Math\.max\(measuredGap \* TERRAIN_GAP_MULTIPLIER, minimumSlotClearance, 10\)/);
  assert.match(runtime, /const x = firstSlotLeft - terrainWidth - clearance/);
  assert.match(runtime, /const y = fieldTop \+ \(fieldHeight - terrainHeight\) \/ 2/);
  assert.match(sheet, /terrain-slot\.is-field-anchored[^}]*width: var\(--terrain-anchor-width\) !important[^}]*height: var\(--terrain-anchor-height\) !important/);
});

test("reserve-aware circular energy display uses the summed numerator only while reserve exists", () => {
  assert.match(runtime, /const syncEnergyDisplay = \(\) =>/);
  assert.match(runtime, /reserve > 0 \? energy \+ reserve : energy/);
  assert.match(runtime, /classList\.toggle\("uses-reserve-total", reserve > 0\)/);
  assert.match(sheet, /energy-dial\.uses-reserve-total strong > em[^}]*color: #b98cff !important/);
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

test("expanded hero matches compact progress geometry and keeps readable ability rows", () => {
  assert.match(sheet, /canonical-hero-panel\.is-expanded[^}]*--hero-card-level-top: calc\(var\(--hero-card-art-top\) \+ var\(--hero-card-art-height\) \+ \.34cqh\)/);
  assert.match(sheet, /canonical-hero-panel\.is-expanded > \.player-hero > \.hero-level-row[^}]*left: \.34cqw !important[^}]*right: \.34cqw !important[^}]*top: var\(--hero-card-level-top\) !important/);
  assert.match(sheet, /hero-command-bar > \.hero-ability-chip[^}]*min-height: 4\.18cqh !important/);
  assert.match(sheet, /hero-command-bar > \.hero-ability-chip[^}]*column-gap: \.62cqw !important/);
  assert.match(sheet, /hero-ability-copy > p[^}]*line-height: 1\.17 !important/);
});

test("evolution progress track preserves the inline percentage as a visible fill", () => {
  assert.match(sheet, /hero-level-row > \.hero-evolution[^}]*grid-template-rows: minmax\(0, 1fr\) \.48cqh !important/);
  assert.match(sheet, /\.evolution-track[^}]*width: 100% !important[^}]*height: \.48cqh !important/);
  assert.match(sheet, /\.evolution-track > i[^}]*left: 0 !important[^}]*height: 100% !important[^}]*max-width: 100% !important/);
  assert.doesNotMatch(sheet, /\.evolution-track > i[^}]*width:\s*[^}]+!important/);
});

test("short landscape has its own compact but readable balance", () => {
  const landscape = css.slice(css.indexOf("@media (orientation: landscape)"));
  assert.match(landscape, /--hero-card-level-top: calc\(var\(--hero-card-art-top\) \+ var\(--hero-card-art-height\) \+ \.27cqh\)/);
  assert.match(landscape, /height: 46\.2cqh !important/);
  assert.match(landscape, /min-height: 3\.82cqh !important/);
  assert.match(landscape, /line-height: 1\.15 !important/);
});

test("visual balance stylesheet is the terminal hero CSS authority", () => {
  const geometry = layout.indexOf('import "./presentation/styles/hero-panel-layout-final.css"');
  const balance = layout.indexOf('import "./presentation/styles/hero-panel-visual-balance-final.css"');
  assert.ok(geometry >= 0 && balance > geometry);
});

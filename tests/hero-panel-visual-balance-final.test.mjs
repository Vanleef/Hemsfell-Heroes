import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hero-panel-visual-balance-final.css", "utf8");
const terminal = fs.readFileSync("app/presentation/styles/hero-panel-polish-terminal.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);
const finalSheet = compact(terminal);

test("Cruel Terrain keeps proportional clearance and a field-slot-sized footprint", () => {
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
  assert.match(runtime, /const x = firstSlotLeft - slotWidth - clearance/);
  assert.match(runtime, /const y = fieldTop \+ \(fieldHeight - slotHeight\) \/ 2/);
  assert.doesNotMatch(runtime, /const terrainWidth = terrainRect\.width/);
  assert.match(finalSheet, /terrain-slot\.is-field-anchored[^}]*visibility: visible !important[^}]*opacity: 1 !important/);
  assert.match(finalSheet, /terrain-slot\.is-field-anchored > \.card-frame[^}]*inset: 0 !important[^}]*width: 100% !important[^}]*height: 100% !important/);
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

test("hero identity keeps one centered bottom-name baseline and a portrait gap below the shadow", () => {
  assert.match(sheet, /hero-power-trigger > \.hero-life[^}]*top: \.48cqh !important[^}]*right: \.38cqw !important[^}]*bottom: auto !important/);
  assert.match(finalSheet, /hero-short-name[^}]*bottom: 1\.02cqh !important/);
  assert.match(finalSheet, /hero-short-name[^}]*text-align: center !important/);
  assert.match(finalSheet, /hero-portrait::after[^}]*bottom: \.42cqh !important[^}]*height: 18% !important/);
});

test("hero progress uses one solid fill and outlined copy above it", () => {
  assert.match(finalSheet, /\.evolution-track > i[^}]*background: #86ad63 !important/);
  assert.match(finalSheet, /\.hero-evolution-copy > small,[^{]*\.hero-evolution-copy > strong[^}]*-webkit-text-stroke: \.42px/);
  assert.match(finalSheet, /\.hero-evolution-copy[^}]*z-index: 3 !important/);
  assert.match(finalSheet, /\.evolution-track[^}]*position: absolute !important[^}]*inset: 0 !important[^}]*z-index: 1 !important/);
  const fillRule = finalSheet.match(/\.evolution-track > i\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(fillRule, /linear-gradient/);
  assert.doesNotMatch(fillRule, /(?:^|;)\s*width\s*:/);
});

test("expanded hero matches compact progress geometry and keeps readable ability rows", () => {
  assert.match(sheet, /canonical-hero-panel\.is-expanded[^}]*--hero-card-level-top: calc\(var\(--hero-card-art-top\) \+ var\(--hero-card-art-height\) \+ \.34cqh\)/);
  assert.match(sheet, /canonical-hero-panel\.is-expanded > \.player-hero > \.hero-level-row[^}]*left: \.34cqw !important[^}]*right: \.34cqw !important[^}]*top: var\(--hero-card-level-top\) !important/);
  assert.match(sheet, /hero-command-bar > \.hero-ability-chip[^}]*min-height: 4\.18cqh !important/);
  assert.match(sheet, /hero-command-bar > \.hero-ability-chip[^}]*column-gap: \.62cqw !important/);
  assert.match(sheet, /hero-ability-copy > p[^}]*line-height: 1\.17 !important/);
});

test("short landscape keeps the same visual relationships responsively", () => {
  const landscape = terminal.slice(terminal.indexOf("@media (orientation: landscape)"));
  assert.match(landscape, /hero-portrait::after[^}]*bottom: \.32cqh !important/);
  assert.match(landscape, /hero-short-name[^}]*bottom: \.82cqh !important/);
});

test("terminal polish loads after every previous hero CSS authority", () => {
  const geometry = layout.indexOf('import "./presentation/styles/hero-panel-layout-final.css"');
  const balance = layout.indexOf('import "./presentation/styles/hero-panel-visual-balance-final.css"');
  const terminalIndex = layout.indexOf('import "./presentation/styles/hero-panel-polish-terminal.css"');
  assert.ok(geometry >= 0 && balance > geometry && terminalIndex > balance);
});

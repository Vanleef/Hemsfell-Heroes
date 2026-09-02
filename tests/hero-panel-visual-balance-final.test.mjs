import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hero-panel-visual-balance-final.css", "utf8");
const terminal = fs.readFileSync("app/presentation/styles/hero-panel-polish-terminal.css", "utf8");
const dragCss = fs.readFileSync("app/presentation/styles/terrain-drag-stability.css", "utf8");
const statusCss = fs.readFileSync("app/presentation/styles/hero-status-visibility-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);
const finalSheet = compact(terminal);
const dragSheet = compact(dragCss);
const statusSheet = compact(statusCss);

test("Cruel Terrain keeps a half-gap field gutter and a field-slot-sized footprint", () => {
  assert.match(runtime, /\.field-slot\[data-slot="1"\]/);
  assert.match(runtime, /\.field-slot\[data-slot="2"\]/);
  assert.match(runtime, /secondRect\.left - firstRect\.right/);
  assert.match(runtime, /measuredGap \* 0\.50/);
  assert.match(runtime, /firstRect\.width \* 0\.08/);
  assert.doesNotMatch(runtime, /TERRAIN_GAP_MULTIPLIER/);
  assert.doesNotMatch(runtime, /TERRAIN_MIN_SLOT_CLEARANCE/);
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
  assert.match(dragSheet, /terrain-drag-sentinel\[data-active="true"\][^}]*visibility: visible !important[^}]*opacity: 1 !important/);
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

test("final active effects and ability typography use available panel space adaptively", () => {
  assert.match(statusSheet, /hero-status-cues > span[^}]*min-height: 2\.55cqh !important/);
  assert.match(statusSheet, /hero-status-cues > span[^}]*font-size: clamp\(\.54rem, min\(\.78cqw, 1\.16cqh\), \.82rem\) !important/);
  assert.match(statusSheet, /hero-ability-chip[^}]*column-gap: \.78cqw !important/);
  assert.match(statusSheet, /hero-ability-chip[^}]*grid-template-columns: 2\.62cqh minmax\(0, 1fr\) !important/);
  assert.match(statusSheet, /hero-ability-chip > :is\(\.hero-ability-copy, span\) > p[^}]*font-size: clamp\(\.6rem, min\(\.88cqw, 1\.28cqh\), \.86rem\) !important/);
  assert.match(statusSheet, /hero-ability-chip\.copy-compact[^}]*font-size: clamp\(\.55rem, min\(\.8cqw, 1\.17cqh\), \.78rem\) !important/);
  assert.match(statusSheet, /hero-ability-chip\.copy-dense[^}]*font-size: clamp\(\.49rem, min\(\.71cqw, 1\.05cqh\), \.7rem\) !important/);
});

test("short landscape keeps the same visual relationships responsively", () => {
  const landscape = terminal.slice(terminal.indexOf("@media (orientation: landscape)"));
  assert.match(landscape, /hero-portrait::after[^}]*bottom: \.32cqh !important/);
  assert.match(landscape, /hero-short-name[^}]*bottom: \.82cqh !important/);
  const responsiveStatus = statusCss.slice(statusCss.indexOf("@media (orientation: landscape)"));
  assert.match(responsiveStatus, /hero-status-cues > span[^}]*font-size: clamp\(\.46rem, min\(\.68cqw, 1cqh\), \.7rem\) !important/);
  assert.match(responsiveStatus, /hero-ability-chip\.copy-dense[^}]*font-size: clamp\(\.45rem, min\(\.62cqw, \.91cqh\), \.61rem\) !important/);
});

test("terminal polish and status specificity load after previous hero CSS authorities", () => {
  const geometry = layout.indexOf('import "./presentation/styles/hero-panel-layout-final.css"');
  const balance = layout.indexOf('import "./presentation/styles/hero-panel-visual-balance-final.css"');
  const terminalIndex = layout.indexOf('import "./presentation/styles/hero-panel-polish-terminal.css"');
  const dragIndex = layout.indexOf('import "./presentation/styles/terrain-drag-stability.css"');
  const statusIndex = layout.indexOf('import "./presentation/styles/hero-status-visibility-final.css"');
  assert.ok(geometry >= 0 && balance > geometry && terminalIndex > balance && dragIndex > terminalIndex && statusIndex > dragIndex);
});

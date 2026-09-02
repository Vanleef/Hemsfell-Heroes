import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("app/presentation/styles/hero-panel-layout-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const terrainRuntime = fs.readFileSync("app/presentation/runtime/terrain-field-anchor-runtime.tsx", "utf8");

const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("hero overlays keep responsive breathing room from top bar and bottom edge", () => {
  assert.match(css, /--hero-overlay-edge-x: max\(clamp\(\.92rem, 1\.55cqw, 1\.55rem\), env\(safe-area-inset-left, 0px\)\)/);
  assert.match(css, /--hero-overlay-enemy-top: clamp\(2\.75rem, 7\.75cqh, 4\.85rem\)/);
  assert.match(css, /--hero-overlay-player-bottom: max\(clamp\(1\.2rem, 2\.55cqh, 1\.9rem\), env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(sheet, /canonical-hero-panel\.enemy[^}]*top: var\(--hero-overlay-enemy-top\) !important/);
  assert.match(sheet, /canonical-hero-panel\.player[^}]*bottom: var\(--hero-overlay-player-bottom\) !important/);
});

test("compact hero frame height explicitly includes the progress footer", () => {
  assert.match(css, /--hero-card-level-top: calc\(var\(--hero-card-art-top\) \+ var\(--hero-card-art-height\) \+ \.34cqh\)/);
  assert.match(css, /height: calc\(var\(--hero-card-level-top\) \+ var\(--hero-card-level-height\) \+ \.72cqh\) !important/);
  assert.match(sheet, /canonical-hero-panel:not\(\.is-expanded\) > \.player-hero > \.hero-level-row[^}]*top: var\(--hero-card-level-top\) !important/);
  assert.match(sheet, /canonical-hero-panel:not\(\.is-expanded\) > \.player-hero > \.hero-level-row[^}]*left: \.34cqw !important[^}]*right: \.34cqw !important/);
});

test("Cruel Terrain has safe owner-field fallback rows before exact runtime anchoring", () => {
  assert.match(sheet, /terrain-slot\.enemy-terrain[^}]*grid-row: 4 !important/);
  assert.match(sheet, /terrain-slot\.player-terrain[^}]*grid-row: 6 !important/);
  assert.match(sheet, /terrain-slot\.enemy-terrain, html body[^}]*terrain-slot\.player-terrain[^}]*grid-column: 2 !important/);
  assert.match(sheet, /terrain-slot\.is-field-anchored[^}]*position: absolute !important/);
});

test("Cruel Terrain final position follows first rendered slot with the approved spacing", () => {
  assert.match(terrainRuntime, /const TERRAIN_GAP_MULTIPLIER = 1\.85/);
  assert.match(terrainRuntime, /const TERRAIN_MIN_SLOT_CLEARANCE = 0\.28/);
  assert.match(terrainRuntime, /secondRect\.left - firstRect\.right/);
  assert.match(terrainRuntime, /firstRect\.width \* TERRAIN_MIN_SLOT_CLEARANCE/);
  assert.match(terrainRuntime, /Math\.max\(measuredGap \* TERRAIN_GAP_MULTIPLIER, minimumSlotClearance, 8\)/);
  assert.match(terrainRuntime, /boardRect\.width \/ layoutWidth/);
  assert.match(terrainRuntime, /boardRect\.height \/ layoutHeight/);
  assert.match(terrainRuntime, /const slotWidth = geometry\.firstRect\.width \/ boardScale\.x/);
  assert.match(terrainRuntime, /const slotHeight = geometry\.firstRect\.height \/ boardScale\.y/);
  assert.match(terrainRuntime, /firstSlotLeft = \(geometry\.firstRect\.left - boardRect\.left\) \/ boardScale\.x/);
  assert.match(terrainRuntime, /const x = firstSlotLeft - slotWidth - clearance/);
  assert.match(terrainRuntime, /const y = fieldTop \+ \(fieldHeight - slotHeight\) \/ 2/);
  assert.doesNotMatch(terrainRuntime, /const terrainWidth = terrainRect\.width/);
  assert.match(css, /left: var\(--terrain-anchor-x\) !important/);
  assert.match(css, /top: var\(--terrain-anchor-y\) !important/);
});

test("portrait uses the same measured terrain anchor instead of a separate magic offset", () => {
  assert.match(terrainRuntime, /ResizeObserver/);
  assert.match(terrainRuntime, /orientationchange/);
  assert.match(layout, /<TerrainFieldAnchorRuntime \/>/);
  const portrait = css.slice(css.indexOf("@media (orientation: portrait)"));
  assert.doesNotMatch(portrait, /margin-right: calc\(min\(/);
  assert.doesNotMatch(portrait, /translate: calc\(/);
});

test("final layout geometry loads after tooltip interaction authority", () => {
  const tooltip = layout.indexOf('import "./presentation/styles/hero-panel-tooltip-final.css"');
  const geometry = layout.indexOf('import "./presentation/styles/hero-panel-layout-final.css"');
  assert.ok(tooltip >= 0 && geometry > tooltip);
});

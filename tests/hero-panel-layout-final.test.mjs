import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("app/presentation/styles/hero-panel-layout-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

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

test("Cruel Terrain shares canonical owner field rows and clears the field by one gap", () => {
  assert.match(sheet, /terrain-slot\.enemy-terrain[^}]*grid-row: 4 !important/);
  assert.match(sheet, /terrain-slot\.player-terrain[^}]*grid-row: 6 !important/);
  assert.match(css, /margin-right: calc\(min\(82%, 41cqw\) \+ var\(--hero-terrain-gap\)\) !important/);
  assert.match(css, /margin-right: calc\(min\(91%, 47cqw\) \+ var\(--hero-terrain-gap\)\) !important/);
});

test("portrait keeps terrain in the adjacent column while preserving owner rows", () => {
  const portrait = css.slice(css.indexOf("@media (orientation: portrait)"));
  assert.match(portrait, /grid-column: 2 !important/);
  assert.match(portrait, /grid-row: 4 !important/);
  assert.match(portrait, /grid-row: 6 !important/);
});

test("final layout geometry loads after tooltip interaction authority", () => {
  const tooltip = layout.indexOf('import "./presentation/styles/hero-panel-tooltip-final.css"');
  const geometry = layout.indexOf('import "./presentation/styles/hero-panel-layout-final.css"');
  assert.ok(tooltip >= 0 && geometry > tooltip);
});

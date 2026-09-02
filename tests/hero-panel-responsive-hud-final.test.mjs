import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("app/presentation/styles/hero-panel-screenshot-fixes.css", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("cruel terrains share the final owner field rows and clear slot one", () => {
  assert.match(sheet, /terrain-slot\.enemy-terrain[^}]*grid-row: 3 !important/);
  assert.match(sheet, /terrain-slot\.player-terrain[^}]*grid-row: 5 !important/);
  assert.match(css, /translate: calc\(8\.28cqw - var\(--hero-terrain-gap\)\) 0 !important/);
  assert.match(css, /translate: calc\(4\.5cqw - var\(--hero-terrain-gap\)\) 0 !important/);
});

test("hero overlays retain responsive safe margins from the top bar and bottom edge", () => {
  assert.match(css, /--hero-overlay-enemy-top: clamp\(2\.15rem, 6\.65cqh, 4\.1rem\)/);
  assert.match(css, /--hero-overlay-player-bottom: max\(clamp\(\.72rem, 1\.85cqh, 1\.3rem\), env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /--hero-overlay-edge-x: clamp\(\.68rem, 1\.15cqw, 1\.16rem\)/);
});

test("hero level and life overlays are deliberately larger", () => {
  assert.match(css, /hero-power-trigger::before[\s\S]*min-width: 5\.75cqh !important[\s\S]*height: 2\.78cqh !important/);
  assert.match(css, /hero-power-trigger > \.hero-life[\s\S]*min-width: 7\.1cqh !important[\s\S]*height: 3\.28cqh !important/);
});

test("evolution criterion tooltip can open above or below the isolated panel", () => {
  assert.match(css, /\.hero-panel-stack\.canonical-hero-panel \.evolution-tooltip \{/);
  assert.match(css, /\.canonical-hero-panel\.enemy \.evolution-tooltip[\s\S]*top: calc\(100% \+ \.5cqh\) !important/);
  assert.match(css, /\.canonical-hero-panel\.player \.evolution-tooltip[\s\S]*bottom: calc\(100% \+ \.5cqh\) !important/);
  assert.match(css, /\.hero-evolution:hover > \.evolution-tooltip/);
  assert.match(css, /\.hero-evolution:focus > \.evolution-tooltip/);
  assert.match(page, /className="evolution-tooltip" role="tooltip"/);
});

test("ability type is communicated visually while textual PASSIVA ATIVA stays in tooltip semantics", () => {
  assert.match(page, /isPassive \? "is-passive" : "is-active"/);
  assert.match(page, /data-ability-tooltip=\{`\$\{type\} · \$\{status\} — \$\{ability\}`\}/);
  assert.match(css, /hero-ability-copy > b \{\s*display: none !important/);
  assert.match(css, /hero-ability-chip\.is-passive \{/);
  assert.match(css, /hero-ability-chip\.is-active \{/);
  assert.match(css, /hero-ability-chip\.is-active\.is-available \{/);
});

test("ability index is larger and separated from its text", () => {
  assert.match(css, /grid-template-columns: 2\.92cqh minmax\(0, 1fr\) !important/);
  assert.match(css, /column-gap: \.64cqw !important/);
  assert.match(css, /inline-size: 2\.52cqh !important/);
  assert.match(css, /font-size: clamp\(\.52rem, min\(\.82cqw, 1\.25cqh\), \.8rem\) !important/);
});

test("screenshot fix remains the last hero CSS authority", () => {
  const requested = layout.indexOf('import "./presentation/styles/hero-panel-requested-polish.css"');
  const finalFix = layout.indexOf('import "./presentation/styles/hero-panel-screenshot-fixes.css"');
  assert.ok(requested >= 0 && finalFix > requested);
});

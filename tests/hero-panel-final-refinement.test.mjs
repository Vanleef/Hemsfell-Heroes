import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, page, css] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/hero-panel-final-refinement.css", import.meta.url), "utf8"),
]);

test("final hero refinement loads after overlay isolation", () => {
  assert.match(layout, /hero-panel-overlay-isolation\.css";[\s\S]*hero-panel-final-refinement\.css";/);
});

test("compact and expanded hero panels share one width and remain absolute overlays", () => {
  assert.match(css, /--hero-refined-panel-width:/);
  assert.match(css, /\.hero-panel-stack\.canonical-hero-panel\s*\{[\s\S]*width:\s*var\(--hero-refined-panel-width\)[\s\S]*position:\s*absolute\s*!important/);
  assert.match(css, /\.hero-panel-stack\.canonical-hero-panel\.is-expanded\s*\{[\s\S]*width:\s*var\(--hero-refined-panel-width\)\s*!important/);
});

test("identity row places plain hero name below art and hero level over the artwork", () => {
  assert.match(css, /hero-power-trigger > \.hero-short-name\s*\{[\s\S]*top:\s*calc\(100% \+ var\(--hero-card-identity-gap\)\)[\s\S]*background:\s*transparent\s*!important[\s\S]*text-align:\s*left\s*!important/);
  assert.match(css, /hero-level-row > \.hero-level\s*\{[\s\S]*top:\s*calc\([\s\S]*var\(--hero-card-art-height\)[\s\S]*z-index:\s*60\s*!important/);
});

test("evolve uses the existing progressReady class and replaces progress only when ready", () => {
  assert.match(page, /progressReady\?"level-ready":""/);
  assert.match(css, /player-hero:not\(\.enemy\):not\(\.level-ready\) > \.level-button\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /player-hero\.level-ready > \.hero-level-row > \.hero-evolution\s*\{[\s\S]*visibility:\s*hidden\s*!important/);
  assert.match(css, /player-hero\.level-ready > \.level-button\s*\{[\s\S]*top:\s*var\(--hero-card-level-top\)\s*!important[\s\S]*height:\s*var\(--hero-card-level-height\)\s*!important/);
});

test("terrain cards move into the field column and away from the hero overlay", () => {
  assert.match(css, /terrain-slot\.enemy-terrain,[\s\S]*terrain-slot\.player-terrain\s*\{[\s\S]*grid-column:\s*3\s*!important[\s\S]*justify-self:\s*start\s*!important/);
  assert.match(css, /terrain-slot\.enemy-terrain\s*\{[\s\S]*grid-row:\s*3\s*!important/);
  assert.match(css, /terrain-slot\.player-terrain\s*\{[\s\S]*grid-row:\s*5\s*!important/);
});

test("expanded ability indices are compact centered circles", () => {
  assert.match(css, /hero-ability-chip > \.hero-ability-slot\s*\{[\s\S]*place-items:\s*center\s*!important[\s\S]*aspect-ratio:\s*1 \/ 1\s*!important[\s\S]*border-radius:\s*50%\s*!important/);
});

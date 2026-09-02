import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, css, runtime] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/hero-panel-requested-polish.css", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/runtime/hero-panel-expand-runtime.tsx", import.meta.url), "utf8"),
]);

test("requested polish loads after the restored 22b1999b refinement", () => {
  assert.match(
    layout,
    /hero-panel-final-refinement\.css";[\s\S]*hero-panel-requested-polish\.css";/,
  );
});

test("requested polish never replaces the player hero structural container", () => {
  assert.doesNotMatch(
    css,
    /hero-panel-stack\.canonical-hero-panel\s*>\s*\.player-hero\s*\{[\s\S]*?(?:position|inset|display|grid-area)\s*:/,
  );
  assert.doesNotMatch(css, />\s*\.player-hero\s*\{[\s\S]*inset:\s*0/);
});

test("hero panels keep responsive breathing room from screen edges", () => {
  assert.match(css, /--hero-overlay-edge-x:\s*clamp\(\.55rem, 1\.05cqw, 1rem\)/);
  assert.match(css, /--hero-overlay-enemy-top:\s*clamp\(1\.9rem, 5\.6cqh, 3\.45rem\)/);
  assert.match(css, /--hero-overlay-player-bottom:\s*clamp\(\.58rem, 1\.55cqh, 1\.05rem\)/);
});

test("name and life are larger overlays on the lower edge of the portrait", () => {
  assert.match(
    css,
    /hero-power-trigger > \.hero-short-name\s*\{[\s\S]*bottom:\s*\.48cqh\s*!important[\s\S]*background:\s*transparent\s*!important[\s\S]*font-size:\s*clamp\(\.54rem/,
  );
  assert.match(
    css,
    /hero-power-trigger > \.hero-life\s*\{[\s\S]*bottom:\s*\.32cqh\s*!important[\s\S]*height:\s*2\.88cqh\s*!important[\s\S]*font-size:\s*clamp\(\.58rem/,
  );
});

test("compact card frame visibly extends through the progress footer", () => {
  assert.match(
    css,
    /canonical-hero-panel:not\(\.is-expanded\)\s*\{[\s\S]*height:\s*calc\(var\(--hero-card-level-top\) \+ var\(--hero-card-level-height\) \+ \.56cqh\)\s*!important[\s\S]*border:/,
  );
  assert.match(
    css,
    /canonical-hero-panel:not\(\.is-expanded\),[\s\S]*canonical-hero-panel\.is-expanded\s*\{[\s\S]*--hero-card-art-height:\s*26\.55cqh/,
  );
});

test("runtime mirrors the semantic hero level into a robust portrait badge", () => {
  assert.match(runtime, /setAttribute\("data-hero-level", `Nv\. \$\{level\}`\)/);
  assert.match(runtime, /characterData:\s*true/);
  assert.match(
    css,
    /hero-power-trigger::before\s*\{[\s\S]*content:\s*attr\(data-hero-level\)\s*!important[\s\S]*left:\s*\.34cqw\s*!important[\s\S]*top:\s*\.42cqh\s*!important/,
  );
  assert.match(css, /hero-level-row > \.hero-level\s*\{[\s\S]*clip-path:\s*inset\(50%\)\s*!important/);
});

test("evolve remains hidden until level-ready and then replaces progress in place", () => {
  assert.match(
    css,
    /player-hero:not\(\.enemy\):not\(\.level-ready\) > \.level-button\s*\{[\s\S]*display:\s*none\s*!important/,
  );
  assert.match(
    css,
    /player-hero\.level-ready > \.level-button\s*\{[\s\S]*top:\s*var\(--hero-card-level-top\)\s*!important[\s\S]*height:\s*var\(--hero-card-level-height\)\s*!important/,
  );
});

test("expanded ability index is a compact physically centered circle", () => {
  assert.match(
    css,
    /hero-ability-chip > \.hero-ability-slot\s*\{[\s\S]*place-items:\s*center\s*!important[\s\S]*place-content:\s*center\s*!important[\s\S]*inline-size:\s*2\.16cqh\s*!important[\s\S]*block-size:\s*2\.16cqh\s*!important/,
  );
});

test("cruel terrains share their controller field row and stay just to its left", () => {
  assert.match(
    css,
    /terrain-slot\.enemy-terrain,[\s\S]*terrain-slot\.player-terrain\s*\{[\s\S]*grid-column:\s*3\s*!important[\s\S]*justify-self:\s*end\s*!important[\s\S]*margin-right:\s*calc\(min\(82%, 41cqw\) \+ var\(--hero-terrain-gap\)\)\s*!important/,
  );
  assert.match(css, /terrain-slot\.enemy-terrain\s*\{\s*grid-row:\s*4\s*!important/);
  assert.match(css, /terrain-slot\.player-terrain\s*\{\s*grid-row:\s*6\s*!important/);
  assert.match(css, /margin-right:\s*calc\(min\(91%, 47cqw\) \+ var\(--hero-terrain-gap\)\)\s*!important/);
});

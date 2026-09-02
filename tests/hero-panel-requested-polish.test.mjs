import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, css] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/hero-panel-requested-polish.css", import.meta.url), "utf8"),
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

test("name and life share the lower edge inside the portrait", () => {
  assert.match(
    css,
    /hero-power-trigger > \.hero-short-name\s*\{[\s\S]*top:\s*auto\s*!important[\s\S]*bottom:\s*\.42cqh\s*!important[\s\S]*background:\s*transparent\s*!important/,
  );
  assert.match(
    css,
    /hero-power-trigger > \.hero-life\s*\{[\s\S]*right:\s*\.24cqw\s*!important[\s\S]*top:\s*auto\s*!important[\s\S]*bottom:\s*\.28cqh\s*!important/,
  );
});

test("compact and expanded panels use the same taller artwork proportion", () => {
  assert.match(
    css,
    /canonical-hero-panel:not\(\.is-expanded\),[\s\S]*canonical-hero-panel\.is-expanded\s*\{[\s\S]*--hero-card-art-height:\s*26\.15cqh/,
  );
  assert.match(css, /canonical-hero-panel:not\(\.is-expanded\)\s*\{[\s\S]*height:\s*31\.7cqh/);
  assert.match(css, /canonical-hero-panel\.is-expanded\s*\{[\s\S]*height:\s*60\.2cqh/);
});

test("hero level stays an artwork badge without converting the level row into a new layout", () => {
  assert.match(
    css,
    /hero-level-row > \.hero-level\s*\{[\s\S]*top:\s*calc\(\.42cqh - var\(--hero-card-art-height\) - var\(--hero-card-progress-gap\)\)\s*!important/,
  );
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
    /hero-ability-chip > \.hero-ability-slot\s*\{[\s\S]*place-items:\s*center\s*!important[\s\S]*place-content:\s*center\s*!important[\s\S]*inline-size:\s*2\.18cqh\s*!important[\s\S]*block-size:\s*2\.18cqh\s*!important/,
  );
});

test("cruel terrain uses the same horizontal gap token as owner field slots", () => {
  assert.match(
    css,
    /terrain-slot\.enemy-terrain,[\s\S]*terrain-slot\.player-terrain\s*\{[\s\S]*margin-right:\s*calc\(min\(82%, 41cqw\) \+ var\(--hh-ref-field-gap\)\)\s*!important/,
  );
  assert.match(
    css,
    /margin-right:\s*calc\(min\(91%, 47cqw\) \+ var\(--hh-ref-field-gap\)\)\s*!important/,
  );
});

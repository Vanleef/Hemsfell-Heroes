import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, overlayCss, page] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/hero-panel-overlay-isolation.css", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);

test("hero overlay isolation is the final hero geometry authority", () => {
  assert.match(layout, /hero-panel-level-final\.css";[\s\S]*hero-panel-overlay-isolation\.css";/);
});

test("canonical hero stacks are removed from board grid flow", () => {
  assert.match(overlayCss, /\.hero-panel-stack\.canonical-hero-panel\s*\{[\s\S]*?position:\s*absolute\s*!important/);
  assert.match(overlayCss, /\.hero-panel-stack\.canonical-hero-panel\s*\{[\s\S]*?grid-column:\s*auto\s*!important[\s\S]*?grid-row:\s*auto\s*!important/);
  assert.match(overlayCss, /\.hero-panel-stack\.canonical-hero-panel\s*\{[\s\S]*?contain:\s*layout\s*!important/);
});

test("board is the stable containing block for both hero overlays", () => {
  assert.match(overlayCss, /> \.game-content\.hs-board\s*\{[\s\S]*?position:\s*relative\s*!important/);
  assert.match(overlayCss, /canonical-hero-panel\.enemy[\s\S]*?top:\s*var\(--hero-overlay-enemy-top\)\s*!important[\s\S]*?bottom:\s*auto\s*!important/);
  assert.match(overlayCss, /canonical-hero-panel\.player[\s\S]*?top:\s*auto\s*!important[\s\S]*?bottom:\s*var\(--hero-overlay-player-bottom\)\s*!important/);
});

test("expanded local hero leaves breathing room before evolve action", () => {
  assert.match(overlayCss, /player\.is-expanded > \.hero-command-bar\s*\{[\s\S]*?bottom:\s*4\.8cqh\s*!important/);
  assert.match(overlayCss, /player\.is-expanded > \.player-hero:not\(\.enemy\) > \.level-button\s*\{[\s\S]*?bottom:\s*\.82cqh\s*!important/);
});

test("both canonical stacks remain direct board children", () => {
  assert.match(page, /<div className="hero-panel-stack canonical-hero-panel enemy">/);
  assert.match(page, /<div className="hero-panel-stack canonical-hero-panel player">/);
});

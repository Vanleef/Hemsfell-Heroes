import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("app/presentation/styles/hero-active-effects-anchor-terminal.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("compact hero frame no longer reserves the obsolete internal progress footer", () => {
  assert.match(css, /canonical-hero-panel:not\(\.is-expanded\)[\s\S]*?height:\s*var\(--hero-card-art-height\)\s*!important/);
  assert.match(css, /min-height:\s*var\(--hero-card-art-height\)\s*!important/);
  assert.match(css, /max-height:\s*var\(--hero-card-art-height\)\s*!important/);
});

test("opponent progression is docked below its portrait", () => {
  assert.match(css, /canonical-hero-panel\.enemy:not\(\.is-expanded\)[\s\S]*?hero-level-row[\s\S]*?top:\s*calc\(100% \+ var\(--hh-enemy-progress-gap\)\)\s*!important/);
  assert.match(css, /--hh-enemy-progress-height:/);
});

test("active effects follow the mirrored progression docks", () => {
  assert.match(css, /canonical-hero-panel\.enemy:not\(\.is-expanded\)[\s\S]*?hero-status-cues[\s\S]*?--hh-enemy-progress-height[\s\S]*?--hh-active-effects-gap/);
  assert.match(css, /canonical-hero-panel\.player:not\(\.is-expanded\)[\s\S]*?hero-status-cues[\s\S]*?--hh-player-progress-height[\s\S]*?--hh-active-effects-gap/);
});

test("hero active effects render as one lineage-colored rounded summary panel", () => {
  assert.match(css, /hh-status-overflow-trigger\[data-overflow-kind="hero"\]/);
  assert.match(css, /grid-template-columns:\s*max-content max-content\s*!important/);
  assert.match(css, /border:[\s\S]*?var\(--deck, #d3ad56\)/);
  assert.match(css, /border-radius:\s*clamp\(/);
  assert.match(css, /hero-status-cues > span[\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /hh-status-overflow-label/);
  assert.match(css, /hh-status-overflow-count/);
});

test("active-effect terminal authority loads after mobile hero/card corrections", () => {
  const mobile = layout.indexOf('import "./presentation/styles/mobile-card-icon-scale-terminal.css"');
  const effects = layout.indexOf('import "./presentation/styles/hero-active-effects-anchor-terminal.css"');
  const pile = layout.indexOf('import "./presentation/styles/side-pile-text-shadow-terminal.css"');
  assert.ok(mobile >= 0 && effects > mobile && pile > effects);
});

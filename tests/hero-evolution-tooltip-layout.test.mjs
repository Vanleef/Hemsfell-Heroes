import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("app/presentation/styles/hero-panel-tooltip-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");

test("hero evolution tooltip final authority loads after screenshot geometry", () => {
  const screenshotFix = layout.indexOf('import "./presentation/styles/hero-panel-screenshot-fixes.css"');
  const tooltipFix = layout.indexOf('import "./presentation/styles/hero-panel-tooltip-final.css"');
  assert.ok(screenshotFix >= 0 && tooltipFix > screenshotFix);
});

test("evolution tooltip is fully offset to the board side instead of covering the hero card", () => {
  assert.match(css, /left: calc\(100% \+ var\(--hero-evolution-tooltip-gap\)\) !important/);
  assert.match(css, /canonical-hero-panel\.enemy \.hero-evolution > \.evolution-tooltip[\s\S]*top: 0 !important[\s\S]*bottom: auto !important/);
  assert.match(css, /canonical-hero-panel\.player \.hero-evolution > \.evolution-tooltip[\s\S]*top: auto !important[\s\S]*bottom: 0 !important/);
});

test("tooltip styles the actual PlayerHero markup rather than nonexistent helper classes", () => {
  assert.match(page, /<div className="evolution-tooltip" role="tooltip"><p>/);
  assert.match(css, /\.evolution-tooltip > p \{/);
  assert.match(css, /\.evolution-tooltip > b \{/);
  assert.match(css, /\.evolution-tooltip > div \{/);
  assert.match(css, /\.evolution-tooltip > div > span \{/);
});

test("desktop mouse focus cannot leave evolution tooltip stuck open", () => {
  assert.match(css, /hero-evolution:focus > \.evolution-tooltip,[\s\S]*hero-evolution:focus-within > \.evolution-tooltip[\s\S]*opacity: 0 !important[\s\S]*visibility: hidden !important/);
  assert.match(css, /hero-evolution:hover > \.evolution-tooltip,[\s\S]*hero-evolution:focus-visible > \.evolution-tooltip[\s\S]*opacity: 1 !important[\s\S]*visibility: visible !important/);
});

test("touch can intentionally hold evolution criteria without overlapping the panel", () => {
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*hero-evolution:focus > \.evolution-tooltip,[\s\S]*opacity: 1 !important/);
});

test("tooltip has explicit responsive landscape and portrait bounds", () => {
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 32rem\)/);
  assert.match(css, /@media \(orientation: portrait\)/);
  assert.match(css, /width: min\(46vw, 15rem\) !important/);
  assert.match(css, /max-height: 34cqh !important/);
});

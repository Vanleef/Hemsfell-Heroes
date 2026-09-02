import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("app/presentation/styles/hero-panel-breathing-room.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("compact hero HUD reserves more portrait and metadata room", () => {
  assert.match(css, /--hero-card-art-height:\s*18\.4cqh/);
  assert.match(css, /canonical-hero-panel\.player:not\(\.is-expanded\)[\s\S]*?height:\s*26\.65cqh\s*!important/);
  assert.match(css, /canonical-hero-panel\.enemy:not\(\.is-expanded\)[\s\S]*?height:\s*23\.25cqh\s*!important/);
  assert.match(css, /--hero-card-level-height:\s*3\.15cqh/);
});

test("hero level is explicitly visible and aligned inside portrait", () => {
  assert.match(css, /hero-level-row\s*>\s*\.hero-level[\s\S]*?display:\s*inline-grid\s*!important/);
  assert.match(css, /hero-level-row\s*>\s*\.hero-level[\s\S]*?visibility:\s*visible\s*!important/);
  assert.match(css, /hero-level-row\s*>\s*\.hero-level[\s\S]*?bottom:\s*calc\(100% \+ var\(--hero-card-level-gap\) \+ \.58cqh\)\s*!important/);
  assert.match(css, /hero-level-row\s*>\s*\.hero-level[\s\S]*?z-index:\s*42\s*!important/);
});

test("short landscape keeps the larger compact portrait and evolve plate", () => {
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*?--hero-card-art-height:\s*17\.8cqh/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*?player:not\(\.is-expanded\)[\s\S]*?height:\s*25\.55cqh\s*!important/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*?level-button[\s\S]*?height:\s*2\.2cqh\s*!important/);
});

test("breathing-room refinement is loaded after compact hero tuning", () => {
  const tuning = layout.indexOf('import "./presentation/styles/hero-panel-reference-tuning.css";');
  const breathing = layout.indexOf('import "./presentation/styles/hero-panel-breathing-room.css";');
  assert.ok(tuning >= 0 && breathing > tuning);
});

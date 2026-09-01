import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, css] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/match-reference.css", import.meta.url), "utf8"),
]);

test("the match composition has one responsive stylesheet authority", () => {
  assert.match(layout, /import "\.\/presentation\/styles\/match-reference\.css"/);
  for (const legacy of [
    "reference-board-layout", "reference-layout", "final-responsive-layout",
    "mobile-landscape-pc-parity", "match-stability-polish",
    "desktop-reference-calibration", "reference-composition-parity",
    "reference-composition-polish", "reference-user-adjustments",
  ]) assert.doesNotMatch(layout, new RegExp(legacy));
});

test("the battlefield is mirrored around a real fifty-percent seam", () => {
  assert.match(css, /grid-template-rows:\s*5\.6fr 12\.4fr 29fr 6fr 29fr 18fr\s*!important/);
  assert.match(css, /game-content\.hs-board::after\s*\{[\s\S]*?top:\s*50cqh\s*!important/);
  assert.match(css, /> \.paired-field\s*\{[\s\S]*?grid-template-rows:\s*repeat\(2, max-content\)[\s\S]*?row-gap:\s*3\.8cqh/);
});

test("slot symbols and cards retain proportional responsive targets", () => {
  assert.match(css, /creature-type-icon::before[\s\S]*?crossed swords|creature = crossed swords/i);
  assert.match(css, /auxiliary-type-icon::before[\s\S]*?mystic eye|auxiliary = mystic eye/i);
  assert.match(css, /aspect-ratio:\s*5\s*\/\s*7\s*!important/);
  assert.match(css, /terrain-type-icon[\s\S]*?calc\(var\(--hh-polish-slot-w\) \* \.58\)/);
});

test("energy uses one circumference with capacity and current-energy orbs", () => {
  assert.match(css, /energy-dial:has\(\.energy-ring > i:not\(\.locked\)\)[\s\S]*?outline:\s*0[\s\S]*?box-shadow:\s*none/);
  assert.match(css, /energy-ring > i:not\(\.locked\)[\s\S]*?border:/);
  assert.match(css, /energy-ring > i\.filled[\s\S]*?background:/);
  assert.match(css, /> \.phase-orb\s*\{[\s\S]*?translate:\s*0\s*!important/);
});

test("hero panels reserve distinct portrait, progression, ability and evolve regions", () => {
  assert.match(css, /> \.player-hero\.enemy\s*\{[\s\S]*?height:\s*41\.5cqh/);
  assert.match(css, /> \.player-hero:not\(\.enemy\)\s*\{[\s\S]*?height:\s*43\.5cqh/);
  assert.match(css, /> \.player-hero > \.hero-evolution\s*\{[\s\S]*?visibility:\s*visible[\s\S]*?z-index:\s*210/);
  assert.match(css, /:is\(\.hero-abilities,\.hero-command-bar\)[\s\S]*?margin:\s*24\.2cqh 0 0/);
});

test("short landscape and mobile setup remain explicitly responsive", () => {
  assert.match(css, /@media \(orientation: landscape\) and \(max-width: 64rem\)/);
  assert.match(css, /@media \(max-width: 48rem\)[\s\S]*?\.match-setup\s*\{[\s\S]*?overflow-x:\s*clip/);
  assert.match(css, /\.match-setup > \.difficulty\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

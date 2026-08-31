import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [css, layout] = await Promise.all([
  readFile(new URL("../app/presentation/styles/desktop-reference-calibration.css", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
]);

test("desktop reference calibration is terminal after shared match polish", () => {
  const stability = layout.indexOf('import "./presentation/styles/match-stability-polish.css"');
  const desktop = layout.indexOf('import "./presentation/styles/desktop-reference-calibration.css"');
  assert.ok(stability >= 0);
  assert.ok(desktop > stability);
});

test("ultrawide desktop is detected by aspect ratio and caps board chrome", () => {
  assert.match(css, /@media \(min-width: 64\.01rem\) and \(min-aspect-ratio: 2 \/ 1\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /--hh-ref-slot-w:[^;]+3\.35rem/);
  assert.match(css, /> \.field-energy \{[\s\S]*?width: min\(82%, 42\.5rem\)/s);
  assert.match(css, /> :is\(\.hero-abilities, \.hero-command-bar\) \{[\s\S]*?16\.5rem/s);
  assert.match(css, /> \.side-piles \{[\s\S]*?10\.4rem/s);
  assert.match(css, /> \.player-hand > \.card-frame \{[\s\S]*?4\.7rem/s);
});

test("desktop hero metadata shares one visual x axis beside hero art", () => {
  assert.match(css, /> \.player-hero > \.hero-power-trigger > \.hero-level \{[\s\S]*?left: calc\(100% \+ var\(--hero-meta-gap\)\)[\s\S]*?transform: none !important/s);
  assert.match(css, /> \.player-hero > :is\(\.hero-evolution, \.level-button\) \{[\s\S]*?var\(--hero-card-left, 0rem\)[\s\S]*?var\(--hero-meta-w\)[\s\S]*?transform: none !important/s);
});

test("shallow desktop keeps player energy clear of the hand", () => {
  assert.match(css, /@media \(min-width: 64\.01rem\) and \(max-height: 52rem\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /> \.player-field \{[\s\S]*?-3\.2cqh/s);
  assert.match(css, /> \.player-energy \{[\s\S]*?-6\.7cqh[\s\S]*?z-index: 84/s);
  assert.match(css, /> \.player-hand \{[\s\S]*?\.9cqh[\s\S]*?transform: none !important/s);
  assert.match(css, /> \.enemy-energy \{[\s\S]*?-2\.15cqh/s);
  assert.doesNotMatch(css, /pointer: coarse/);
});

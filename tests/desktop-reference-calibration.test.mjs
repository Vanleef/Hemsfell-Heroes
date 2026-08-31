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

test("ultrawide desktop caps board chrome without changing the backdrop", () => {
  assert.match(css, /@media \(min-width: 100rem\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /--hh-ref-slot-w:[^;]+3\.7rem/);
  assert.match(css, /> \.field-energy \{[\s\S]*?width: min\(82%, 44rem\)/s);
  assert.match(css, /> :is\(\.hero-abilities, \.hero-command-bar\) \{[\s\S]*?17\.5rem/s);
  assert.match(css, /> \.side-piles \{[\s\S]*?11rem/s);
});

test("shallow desktop keeps player energy clear of the hand", () => {
  assert.match(css, /@media \(min-width: 64\.01rem\) and \(max-height: 52rem\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /> \.player-field \{[\s\S]*?-2\.8cqh/s);
  assert.match(css, /> \.player-energy \{[\s\S]*?-4\.8cqh[\s\S]*?z-index: 84/s);
  assert.match(css, /> \.enemy-energy \{[\s\S]*?-1\.9cqh/s);
  assert.doesNotMatch(css, /pointer: coarse/);
});

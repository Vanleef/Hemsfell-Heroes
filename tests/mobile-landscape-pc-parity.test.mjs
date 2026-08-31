import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [css, layout] = await Promise.all([
  readFile(new URL("../app/presentation/styles/mobile-landscape-pc-parity.css", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
]);

test("mobile parity tuning is the final match-layout stylesheet", () => {
  const base = layout.indexOf('import "./presentation/styles/final-responsive-layout.css"');
  const parity = layout.indexOf('import "./presentation/styles/mobile-landscape-pc-parity.css"');
  assert.ok(base >= 0);
  assert.ok(parity > base);
});

test("desktop layout is not affected by the phone-only parity pass", () => {
  assert.match(css, /@media \(orientation: landscape\) and \(hover: none\) and \(pointer: coarse\)/);
  assert.doesNotMatch(css, /@media \(min-width:/);
});

test("phone landscape removes oversized rem floors from permanent board UI", () => {
  assert.match(css, /--hh-ref-slot-w:\s*clamp\(\.95rem,[^;]+8\.65cqh/);
  assert.match(css, /> \.field-energy\s*\{[\s\S]*?height:\s*clamp\(\.42rem, 2\.72cqh, \.88rem\)/);
  assert.match(css, /--hero-card-w:\s*clamp\(1rem,[^;]+11\.4cqh/);
  assert.match(css, /> \.player-hand > \.card-frame\s*\{[\s\S]*?10\.15cqh/);
});

test("mobile top bar keeps the same named phase track as PC", () => {
  assert.match(css, /\.phase-track > div > span\s*\{[\s\S]*?display:\s*inline\s*!important/);
  assert.match(css, /\.phase-track\s*\{[\s\S]*?justify-content:\s*center\s*!important/);
});

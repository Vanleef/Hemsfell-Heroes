import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8").replace(/\s+/g, " ");
const css = fs.readFileSync("app/presentation/styles/mobile-card-icon-scale-terminal.css", "utf8").replace(/\s+/g, " ");

test("mobile card icon authority loads after touch layout and before pile terminal", () => {
  const touch = layout.indexOf('./presentation/styles/mobile-touch-layout-terminal.css');
  const icons = layout.indexOf('./presentation/styles/mobile-card-icon-scale-terminal.css');
  const piles = layout.indexOf('./presentation/styles/side-pile-text-shadow-terminal.css');
  assert.ok(touch >= 0);
  assert.ok(icons > touch);
  assert.ok(piles > icons);
});

test("touch card activation visuals are proportional instead of inheriting the large touch minimum", () => {
  assert.match(css, /\.card-frame-activation\s*\{[^}]*width: clamp\(\.68rem, 15cqi, \.98rem\) !important/);
  assert.match(css, /\.card-frame-activation\s*\{[^}]*min-inline-size: 0 !important[^}]*min-block-size: 0 !important/);
  assert.match(css, /\.card-frame-activation::after\s*\{[^}]*inset: -\.38rem !important[^}]*pointer-events: auto/);
});

test("keyword status and long-press feedback shrink with phone cards", () => {
  assert.match(css, /--keyword-icon-size: clamp\(\.34rem, 8\.5cqi, \.58rem\) !important/);
  assert.match(css, /:is\(\.card-frame-marker,\.summoning-sickness-badge\)[^{]*\{[^}]*width: clamp\(\.4rem, 9\.5cqi, \.64rem\) !important/);
  assert.match(css, /\.card-inspection-hold-progress\s*\{[^}]*width: clamp\(\.86rem, 21%, 1\.22rem\) !important/);
});

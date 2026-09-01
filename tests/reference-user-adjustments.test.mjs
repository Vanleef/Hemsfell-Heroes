import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("terminal user reference stylesheet is loaded after composition polish", () => {
  const layout = read("app/layout.tsx");
  const polish = layout.indexOf("reference-composition-polish.css");
  const adjustments = layout.indexOf("reference-user-adjustments.css");
  assert.ok(polish >= 0);
  assert.ok(adjustments > polish);
});

test("empty creature and auxiliary slots keep proportional vector art", () => {
  const css = read("app/presentation/styles/reference-user-adjustments.css");
  assert.match(css, /span\.slot-type-icon\.creature-type-icon::before/);
  assert.match(css, /span\.slot-type-icon\.auxiliary-type-icon::before/);
  assert.match(css, /mask-size: contain/);
  assert.match(css, /aspect-ratio: 1 \/ 1/);
  assert.match(css, /data:image\/svg\+xml/);
});

test("energy orbit communicates max capacity and keeps current\/max centered", () => {
  const css = read("app/presentation/styles/reference-user-adjustments.css");
  assert.match(css, /energy-ring > i:not\(\.locked\)/);
  assert.match(css, /energy-dial > strong[\s\S]*translate\(-50%, -50%\)/);
  assert.match(css, /player-energy[\s\S]*margin-top: 15\.8cqh/);
  assert.match(css, /--reserve-wheel: #a45cf4/);
});

test("hero ability rails align as the lower section of the hero reference panel", () => {
  const css = read("app/presentation/styles/reference-user-adjustments.css");
  assert.match(css, /hero-power-trigger[\s\S]*height: 19\.15cqh/);
  assert.match(css, /hero-command-bar\.enemy[\s\S]*margin-top: 6\.2cqh/);
  assert.match(css, /hero-command-bar:not\(\.enemy\)[\s\S]*margin-top: 20\.2cqh/);
});

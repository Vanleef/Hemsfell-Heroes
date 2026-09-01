import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("follow-up reference stylesheet is terminal in the layout cascade", () => {
  const layout = read("app/layout.tsx");
  const first = layout.indexOf("reference-user-adjustments.css");
  const second = layout.indexOf("reference-user-adjustments-v2.css");
  assert.ok(first >= 0);
  assert.ok(second > first);
});

test("empty slots use larger crossed-swords and mystical-eye vector masks", () => {
  const css = read("app/presentation/styles/reference-user-adjustments-v2.css");
  assert.match(css, /slot-type-icon\.creature-type-icon[\s\S]*\.68/);
  assert.match(css, /Creature slots: crossed swords/);
  assert.match(css, /Auxiliary slots: mystical eye/);
  assert.match(css, /mask-size: contain/);
});

test("energy dials use one luminous circumference with red enemy and blue player colors", () => {
  const css = read("app/presentation/styles/reference-user-adjustments-v2.css");
  assert.match(css, /enemy-energy[\s\S]*#ff4638/);
  assert.match(css, /player-energy[\s\S]*#25baff/);
  assert.match(css, /energy-dial[\s\S]*border: max\(1px, \.11cqh\) solid var\(--energy-wheel\)/);
  assert.match(css, /energy-dial::before[\s\S]*content: none/);
  assert.match(css, /energy-ring > i:not\(\.locked\)/);
});

test("hero rail gives abilities the lower panel space and attached artifacts have no gold enclosure", () => {
  const css = read("app/presentation/styles/reference-user-adjustments-v2.css");
  assert.match(css, /grid-template-rows: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /hero-command-bar > header[\s\S]*display: none/);
  assert.match(css, /field-column\.linked-pair::before/);
  assert.match(css, /field-column\.linked-pair::after/);
  assert.match(css, /content: none/);
});

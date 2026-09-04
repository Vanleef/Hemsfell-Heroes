import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/presentation/styles/card-interaction-stability-terminal.css", import.meta.url), "utf8");
const tuning = readFileSync(new URL("../app/presentation/styles/card-hud-size-tuning-terminal.css", import.meta.url), "utf8");
const loading = readFileSync(new URL("../app/presentation/styles/card-art-loading-terminal.css", import.meta.url), "utf8");
const markerRuntime = readFileSync(new URL("../app/presentation/runtime/card-marker-counter-runtime.tsx", import.meta.url), "utf8");

test("opponent hand stays closer to the top bar with responsive board-relative lift", () => {
  assert.match(css, /game-stage > \.game-content\.hs-board > \.opponent-hand[\s\S]*?--hh-opponent-hand-top-shift:\s*clamp\(-\.52rem,\s*-\.72cqh,\s*-\.14rem\)/);
  assert.match(css, /margin-top:\s*0\s*!important/);
  assert.match(css, /translate:\s*0 var\(--hh-opponent-hand-top-shift\)\s*!important/);
  assert.match(css, /orientation:\s*landscape[\s\S]*?pointer:\s*coarse[\s\S]*?--hh-opponent-hand-top-shift:\s*clamp\(-\.3rem,\s*-\.52cqh,\s*-\.08rem\)/);
});

test("moving card faces never expose offense or vitality badges", () => {
  const flightRule = css.match(/html body \.hh-flight-face :is\(([\s\S]*?)\) \{([\s\S]*?)\n\}/);
  assert.ok(flightRule, "expected terminal flight-face chrome rule");
  assert.match(flightRule[1], /\.live-atk/);
  assert.match(flightRule[1], /\.live-hp/);
  assert.match(flightRule[2], /display:\s*none\s*!important/);
});

test("field offense and vitality reuse the hand medallion language at a smaller scale", () => {
  assert.match(tuning, /card-frame\[data-unit-id\] > \.original-card > :is\(\.live-atk,\.live-hp\)[\s\S]*?inline-size:\s*clamp\(\.62rem,\s*21\.5cqi,\s*1\.28rem\)/);
  assert.match(tuning, /\.live-atk[\s\S]*?inset-inline-start:\s*4\.2%[\s\S]*?#b7762f[\s\S]*?#5f301a/);
  assert.match(tuning, /\.live-hp[\s\S]*?inset-inline-end:\s*4\.2%[\s\S]*?#a9443d[\s\S]*?#5f1e24/);
  assert.match(tuning, /border:\s*max\(1px, 1\.1cqi\) solid rgb\(255 244 205 \/ 76%\)/);
  assert.match(tuning, /font:\s*950 clamp\(\.39rem,\s*13\.2cqi,\s*\.74rem\)\/1 system-ui/);
});

test("effect and activated-ability chrome is reduced responsively", () => {
  assert.match(loading, /^@import "\.\/card-hud-size-tuning-terminal\.css";/);
  assert.match(tuning, /--keyword-icon-size:\s*clamp\(\.5rem,\s*12\.2cqi,\s*\.82rem\)/);
  assert.match(tuning, /card-frame > \.card-frame-activation[\s\S]*?width:\s*clamp\(\.7rem,\s*15\.4cqi,\s*1\.02rem\)/);
  assert.match(tuning, /hover:\s*hover[\s\S]*?pointer:\s*fine[\s\S]*?card-frame-activation[\s\S]*?width:\s*clamp\(\.78rem,\s*16\.8cqi,\s*1\.08rem\)/);
  assert.match(tuning, /orientation:\s*landscape[\s\S]*?pointer:\s*coarse[\s\S]*?card-frame-activation[\s\S]*?width:\s*clamp\(\.59rem,\s*12\.9cqi,\s*\.84rem\)/);
});

test("markers are centered numeric counters without changing rule-owned amounts", () => {
  assert.match(tuning, /card-frame\[data-unit-id\] > \.card-frame-marker[\s\S]*?top:\s*50%[\s\S]*?left:\s*50%[\s\S]*?transform:\s*translate\(-50%, -50%\)/);
  assert.match(markerRuntime, /raw\.replace\(\/\[\^0-9-\]\/g, ""\)/);
  assert.match(markerRuntime, /node\.textContent = value/);
  assert.match(markerRuntime, /node\.dataset\.markerCount = value/);
  assert.match(markerRuntime, /Presentation-only normalization/);
});

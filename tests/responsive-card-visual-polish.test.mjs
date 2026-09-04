import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/presentation/styles/card-interaction-stability-terminal.css", import.meta.url), "utf8");
const tuning = readFileSync(new URL("../app/presentation/styles/card-hud-size-tuning-terminal.css", import.meta.url), "utf8");
const loading = readFileSync(new URL("../app/presentation/styles/card-art-loading-terminal.css", import.meta.url), "utf8");

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

test("field offense and vitality keep the hand visual language at a smaller final scale", () => {
  assert.match(css, /card-frame\[data-unit-id\] > \.original-card > :is\(\.live-atk,\.live-hp\)[\s\S]*?bottom:\s*3\.8%/);
  assert.match(css, /\.live-atk[\s\S]*?left:\s*4\.2%[\s\S]*?#b7762f[\s\S]*?#5f301a/);
  assert.match(css, /\.live-hp[\s\S]*?right:\s*4\.2%[\s\S]*?#a9443d[\s\S]*?#5f1e24/);
  assert.match(tuning, /inline-size:\s*clamp\(\.68rem,\s*24\.5cqi,\s*1\.48rem\)/);
  assert.match(tuning, /font:\s*950 clamp\(\.43rem,\s*15\.3cqi,\s*\.88rem\)\/1 system-ui/);
});

test("effect marker and activated-ability chrome is reduced responsively without shrinking touch hit slop", () => {
  assert.match(loading, /^@import "\.\/card-hud-size-tuning-terminal\.css";/);
  assert.match(tuning, /--keyword-icon-size:\s*clamp\(\.54rem,\s*13\.5cqi,\s*\.92rem\)/);
  assert.match(tuning, /card-frame > \.card-frame-activation[\s\S]*?width:\s*clamp\(\.78rem,\s*17\.2cqi,\s*1\.14rem\)/);
  assert.match(tuning, /hover:\s*hover[\s\S]*?pointer:\s*fine[\s\S]*?width:\s*clamp\(\.68rem,\s*15\.7cqi,\s*1\.08rem\)[\s\S]*?card-frame > \.card-frame-activation[\s\S]*?width:\s*clamp\(\.88rem,\s*18\.8cqi,\s*1\.22rem\)/);
  assert.match(tuning, /orientation:\s*landscape[\s\S]*?pointer:\s*coarse[\s\S]*?width:\s*clamp\(\.42rem,\s*10cqi,\s*\.68rem\)[\s\S]*?card-frame > \.card-frame-activation[\s\S]*?width:\s*clamp\(\.66rem,\s*14\.5cqi,\s*\.94rem\)/);
});

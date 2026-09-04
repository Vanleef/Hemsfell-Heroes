import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/presentation/styles/card-interaction-stability-terminal.css", import.meta.url), "utf8");

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

test("field offense and vitality reuse the hand metric visual language", () => {
  assert.match(css, /card-frame\[data-unit-id\] > \.original-card > :is\(\.live-atk,\.live-hp\)[\s\S]*?bottom:\s*3\.8%/);
  assert.match(css, /inline-size:\s*clamp\(\.76rem,\s*28cqi,\s*1\.72rem\)/);
  assert.match(css, /font:\s*950 clamp\(\.47rem,\s*17\.5cqi,\s*1rem\)\/1 system-ui/);
  assert.match(css, /\.live-atk[\s\S]*?left:\s*4\.2%[\s\S]*?#b7762f[\s\S]*?#5f301a/);
  assert.match(css, /\.live-hp[\s\S]*?right:\s*4\.2%[\s\S]*?#a9443d[\s\S]*?#5f1e24/);
});

test("effect and activated-ability icons grow responsively without desktop sizes leaking onto touch", () => {
  assert.match(css, /--keyword-icon-size:\s*clamp\(\.58rem,\s*15\.2cqi,\s*1\.04rem\)/);
  assert.match(css, /card-frame > \.card-frame-activation[\s\S]*?width:\s*clamp\(\.86rem,\s*19\.5cqi,\s*1\.28rem\)/);
  assert.match(css, /hover:\s*hover[\s\S]*?pointer:\s*fine[\s\S]*?width:\s*clamp\(\.76rem,\s*17\.5cqi,\s*1\.22rem\)[\s\S]*?card-frame > \.card-frame-activation[\s\S]*?width:\s*clamp\(\.98rem,\s*21cqi,\s*1\.38rem\)/);
  assert.match(css, /orientation:\s*landscape[\s\S]*?pointer:\s*coarse[\s\S]*?width:\s*clamp\(\.46rem,\s*11cqi,\s*\.74rem\)[\s\S]*?card-frame > \.card-frame-activation[\s\S]*?width:\s*clamp\(\.72rem,\s*16cqi,\s*1\.04rem\)/);
});

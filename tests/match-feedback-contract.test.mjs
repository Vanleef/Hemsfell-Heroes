import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/match-feedback-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/match-feedback-final.css", "utf8");
const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("defense decision is anchored to the hero HUD lane and remeasured with its owners", () => {
  assert.match(runtime, /:scope > \.hero-panel-stack\.canonical-hero-panel\.enemy/);
  assert.match(runtime, /:scope > \.hero-panel-stack\.canonical-hero-panel\.player/);
  assert.match(runtime, /heroLaneRightViewport = Math\.min\(heroLaneNaturalRightViewport, firstPlayfieldLeftViewport - fieldGap\)/);
  assert.match(runtime, /gapTopViewport = enemyRect\.bottom \+ verticalGapPadding/);
  assert.match(runtime, /gapBottomViewport = playerRect\.top - verticalGapPadding/);
  assert.match(runtime, /dataset\.geometryAnchored = "hero-lane-between-panels"/);
  assert.match(runtime, /resizeObserver\.observe\(enemyPanel\)/);
  assert.match(runtime, /resizeObserver\.observe\(playerPanel\)/);
  assert.match(runtime, /resizeObserver\.observe\(defenseDecision\)/);
  assert.match(sheet, /\.defense-decision[^}]*position: absolute !important[^}]*left: var\(--hero-overlay-edge-x/);
  assert.match(sheet, /\.defense-decision[^}]*top: 50% !important[^}]*width: min\(17\.35cqw, 29\.9cqh\) !important/);
});

test("evolution availability is visible on the hero panel without a body portal dependency", () => {
  assert.match(runtime, /classList\.toggle\("evolution-ready", ready\)/);
  assert.match(runtime, /classList\.toggle\("evolution-available", available\)/);
  assert.match(runtime, /panel\.dataset\.evolutionAvailable = "true"/);
  assert.doesNotMatch(runtime, /document\.body\.appendChild/);
  assert.match(css, /:has\(> \.player-hero\.level-ready > \.level-button:not\(:disabled\)\)/);
  assert.match(css, /content: "EVOLUÇÃO DISPONÍVEL" !important/);
  assert.match(sheet, /player-hero\.level-ready > \.level-button[^}]*display: grid !important[^}]*opacity: 1 !important[^}]*visibility: visible !important/);
  assert.match(sheet, /player-hero\.level-ready > \.level-button:not\(:disabled\)[^}]*border-color: #f2ca58 !important/);
  assert.match(css, /@keyframes hero-evolution-aura/);
  assert.match(css, /@keyframes hero-evolution-banner-blink/);
});

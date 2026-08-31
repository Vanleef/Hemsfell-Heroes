import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const cssUrl = new URL("../app/presentation/styles/match-stability-polish.css", import.meta.url);
const responsiveUrl = new URL("../app/presentation/styles/final-responsive-layout.css", import.meta.url);

test("terminal match polish loads after the canonical reference layout", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const reference = layout.indexOf('import "./presentation/styles/board/reference-layout.css"');
  const stability = layout.indexOf('import "./presentation/styles/match-stability-polish.css"');
  assert.ok(reference >= 0);
  assert.ok(stability > reference);
});

test("opponent hand and enemy cluster are nudged inward and stay unclipped", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /> \.opponent-hand \{[\s\S]*?3\.6cqh[\s\S]*?overflow: visible !important/s);
  assert.match(css, /> \.opponent-hand > :is\([\s\S]*?\.official-card-back[\s\S]*?\.opponent-card-back[\s\S]*?clip-path: none !important/s);
  assert.match(css, /> \.enemy-energy \{[\s\S]*?translate: 0 clamp\(-\.3rem, -\.35cqh, -\.04rem\)/s);
  assert.match(css, /> \.enemy-field \{[\s\S]*?margin-top: clamp\(\.14rem, 2\.8cqh, 1\.65rem\)/s);
  assert.match(css, /> \.enemy-terrain \{[\s\S]*?translate: 0 clamp\(-\.22rem, -\.22cqh, -\.03rem\)/s);
});

test("opponent battlefield mirrors auxiliary and creature rows toward center", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /> \.enemy-field \.creature-slot \{\s*grid-row: 2 !important;\s*\}/s);
  assert.match(css, /> \.enemy-field \.auxiliary-slot \{\s*grid-row: 1 !important;\s*\}/s);
  assert.match(css, /> \.player-field \.creature-slot \{\s*grid-row: 1 !important;\s*\}/s);
  assert.match(css, /> \.player-field \.auxiliary-slot \{\s*grid-row: 2 !important;\s*\}/s);
});

test("short desktop viewports never inherit phone landscape compression", async () => {
  const [css, responsive] = await Promise.all([readFile(cssUrl, "utf8"), readFile(responsiveUrl, "utf8")]);
  assert.match(responsive, /\(max-height: 44rem\) and \(hover: none\) and \(pointer: coarse\)/);
  assert.doesNotMatch(responsive, /\(orientation: landscape\) and \(max-height: 44rem\)\s*\{/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 44rem\) and \(hover: none\) and \(pointer: coarse\)/);
});

test("target feedback cannot zoom card badges away from their anchors", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.card-frame:has\(> \.original-card:is\(\.target-ally, \.target-enemy\)\)/);
  assert.match(css, /\.field-keywords/);
  assert.match(css, /\.field-negative-statuses/);
  assert.match(css, /\.card-frame-marker/);
  assert.match(css, /\.card-frame-activation/);
  assert.match(css, /scale: 1 !important/);
  assert.match(css, /\.target-enemy\):not\(\.is-exhausted\)[\s\S]*?transform: none !important/s);
  assert.match(css, /@keyframes hh-stable-valid-target/);
});

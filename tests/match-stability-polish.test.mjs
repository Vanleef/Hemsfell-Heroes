import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const cssUrl = new URL("../app/presentation/styles/match-stability-polish.css", import.meta.url);

test("terminal match polish loads after the reference board contract", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const reference = layout.indexOf('import "./presentation/styles/board/reference-board-layout.css"');
  const stability = layout.indexOf('import "./presentation/styles/match-stability-polish.css"');
  assert.ok(reference >= 0);
  assert.ok(stability > reference);
});

test("opponent hand follows the shifted opponent cluster and stays unclipped", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /> \.opponent-hand \{[\s\S]*?var\(--hh-reference-shift-y, 0px\)[\s\S]*?overflow: visible !important/s);
  assert.match(css, /> \.opponent-hand > :is\([\s\S]*?\.official-card-back[\s\S]*?\.opponent-card-back[\s\S]*?clip-path: none !important/s);
  assert.match(css, /> \.enemy-energy \{[\s\S]*?var\(--hh-reference-shift-y, 0px\) - clamp/s);
  assert.match(css, /> :is\(\.enemy-field, \.enemy-terrain\) \{[\s\S]*?var\(--hh-reference-shift-y, 0px\) - clamp/s);
});

test("target feedback cannot zoom card badges away from their anchors", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.card-frame:has\(> \.original-card:is\(\.target-ally, \.target-enemy\)\)/);
  assert.match(css, /\.field-keywords/);
  assert.match(css, /\.field-negative-statuses/);
  assert.match(css, /\.card-frame-marker/);
  assert.match(css, /\.card-frame-activation/);
  assert.match(css, /scale: 1 !important/);
  assert.match(css, /@keyframes hh-stable-valid-target/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = await readFile(
  new URL("../app/presentation/styles/reference-composition-polish.css", import.meta.url),
  "utf8",
);

test("final composition polish is imported after parity", () => {
  const parity = layout.indexOf('reference-composition-parity.css');
  const polish = layout.indexOf('reference-composition-polish.css');
  assert.ok(parity >= 0, "reference parity stylesheet should stay imported");
  assert.ok(polish > parity, "composition polish must remain the final board geometry authority");
});

test("battlefield polish preserves Tessalia commander identity and lane breathing room", () => {
  assert.match(css, /commander-slot/);
  assert.match(css, /#f0444f/i);
  assert.match(css, /row-gap:\s*clamp\([^;]*2\.65cqh/i);
  assert.match(css, /--hh-polish-slot-w:\s*min\(9\.05cqh,\s*5\.05cqw\)/i);
});

test("hero progress, evolve button and active effects share the external metadata rail", () => {
  assert.match(css, /--hh-polish-meta-w/);
  assert.match(css, /player-hero\s*>\s*\.hero-evolution[\s\S]*left:\s*calc\(100%\s*\+\s*\.55cqw\)/i);
  assert.match(css, /player-hero\s*>\s*\.level-button[\s\S]*left:\s*calc\(100%\s*\+\s*\.55cqw\)/i);
  assert.match(css, /hero-status-cues\.local[\s\S]*left:\s*calc\(100%\s*\+\s*\.55cqw\)/i);
});

test("hero name is a portrait header instead of a floating pill", () => {
  assert.match(css, /\.hero-short-name[\s\S]*height:\s*2\.35cqh/i);
  assert.match(css, /border-radius:\s*\.42cqw\s+\.42cqw\s+0\s+0/i);
  assert.match(css, /border-bottom:/i);
});

test("right pile rail grows without colliding with response mode", () => {
  assert.match(css, /\.side-piles[\s\S]*width:\s*min\(14\.85cqw,\s*27\.5cqh\)/i);
  assert.match(css, /\.enemy-piles[\s\S]*margin-top:\s*7\.4cqh/i);
  assert.match(css, /\.priority-control-toggle[\s\S]*right:\s*max\(16\.15cqw/i);
});

test("player hand is deliberately smaller than the parity pass", () => {
  assert.match(css, /player-hand\s*>\s*\.card-frame[\s\S]*11\.45cqh[\s\S]*6\.35cqw/i);
});

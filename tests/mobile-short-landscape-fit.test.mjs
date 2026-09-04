import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/presentation/styles/priority-card-anchor-terminal.css", import.meta.url), "utf8");

test("short phone landscape uses the wide axis instead of globally miniaturizing the match", () => {
  assert.match(css, /orientation:\s*landscape[\s\S]*pointer:\s*coarse[\s\S]*max-height:\s*34rem/);
  assert.match(css, /--hh-reference-shift-y:\s*clamp\(\.18rem,\s*1\.5dvh,\s*\.48rem\)\s*!important/);
  assert.match(css, /canonical-hero-panel[\s\S]*scale:\s*\.82\s*!important/);
});

test("mobile hero progress gets a wider readable lane without colliding with the ability rail", () => {
  assert.match(css, /hero-level-row[\s\S]*width:\s*calc\(100% \+ clamp\(1\.25rem,\s*3\.8dvw,\s*1\.65rem\)\)\s*!important/);
  assert.match(css, /font-size:\s*clamp\(\.82rem,\s*2\.35dvh,\s*\.96rem\)\s*!important/);
  assert.match(css, /hero-ability-rail[\s\S]*left:\s*calc\(var\(--hh-hero-art-right, 100%\) \+ clamp\(1\.35rem,\s*3\.7dvw,\s*1\.75rem\)\)\s*!important/);
});

test("mobile hand is raised clear of browser chrome and secondary HUD is de-emphasized", () => {
  assert.match(css, /\.player-hand[\s\S]*scale:\s*\.94\s*!important[\s\S]*translate:\s*0 -4dvh\s*!important/);
  assert.match(css, /:is\(\.enemy-energy,\.player-energy\)[\s\S]*scale:\s*\.74\s*!important/);
  assert.match(css, /:is\(\.enemy-piles,\.player-piles\)[\s\S]*scale:\s*\.76\s*!important/);
  assert.match(css, /phase-orb:not\(:empty\)[\s\S]*scale:\s*\.7\s*!important/);
});

test("mobile header restores readable information hierarchy", () => {
  assert.match(css, /priority-control-toggle[\s\S]*max-width:\s*clamp\(6\.45rem,\s*8\.2dvw,\s*7\.4rem\)\s*!important/);
  assert.match(css, /turn-owner > b[\s\S]*font-size:\s*clamp\(\.62rem,\s*1\.9dvh,\s*\.74rem\)\s*!important/);
  assert.match(css, /phase-track > div > span[\s\S]*font-size:\s*clamp\(\.52rem,\s*1\.6dvh,\s*\.64rem\)\s*!important/);
});

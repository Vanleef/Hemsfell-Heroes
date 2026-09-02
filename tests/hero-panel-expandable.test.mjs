import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, runtime, css] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/runtime/hero-panel-expand-runtime.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/hero-panel-reference-tuning.css", import.meta.url), "utf8"),
]);

test("hero panel compact/expanded runtime is globally mounted", () => {
  assert.match(layout, /HeroPanelExpandRuntime/);
  assert.match(layout, /<HeroPanelExpandRuntime\s*\/>/);
  assert.match(runtime, /canonical-hero-panel/);
  assert.match(runtime, /classList\.toggle\("is-expanded"/);
  assert.match(runtime, /aria-expanded/);
  assert.match(runtime, /event\.key === "Escape"/);
});

test("hero expansion never steals an authoritative hero target click", () => {
  assert.match(runtime, /target-ally/);
  assert.match(runtime, /target-enemy/);
  assert.match(runtime, /isHeroTargeting\(panel\)/);
});

test("compact hero HUD hides full powers and keeps evolution under progress", () => {
  assert.match(css, /canonical-hero-panel:not\(\.is-expanded\)[\s\S]*?width:\s*min\(17\.7cqw, 30\.4cqh\)/);
  assert.match(css, /canonical-hero-panel\.player:not\(\.is-expanded\)[\s\S]*?height:\s*23\.05cqh/);
  assert.match(css, /canonical-hero-panel:not\(\.is-expanded\) > \.hero-command-bar[\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /player:not\(\.is-expanded\) > \.player-hero:not\(\.enemy\) > \.level-button[\s\S]*?top:\s*calc\(var\(--hero-card-level-top\) \+ var\(--hero-card-level-height\) \+ \.28cqh\)/);
});

test("expanded hero card restores three readable labeled abilities", () => {
  assert.match(css, /canonical-hero-panel\.is-expanded[\s\S]*?width:\s*min\(28\.4cqw, 49cqh\)[\s\S]*?height:\s*46cqh/);
  assert.match(css, /canonical-hero-panel\.is-expanded > \.hero-command-bar[\s\S]*?display:\s*grid\s*!important[\s\S]*?grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /canonical-hero-panel\.is-expanded \.hero-ability-copy > b[\s\S]*?display:\s*block\s*!important[\s\S]*?visibility:\s*visible\s*!important/);
  assert.match(css, /canonical-hero-panel\.is-expanded \.hero-ability-copy > p[\s\S]*?font-size:\s*clamp/);
});

test("expanded local hero places evolve in the card footer", () => {
  assert.match(css, /canonical-hero-panel\.player\.is-expanded > \.hero-command-bar[\s\S]*?bottom:\s*3\.75cqh/);
  assert.match(css, /canonical-hero-panel\.player\.is-expanded > \.player-hero:not\(\.enemy\) > \.level-button[\s\S]*?top:\s*auto[\s\S]*?bottom:\s*\.68cqh/);
});

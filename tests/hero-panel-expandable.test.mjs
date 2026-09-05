import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [gate, runtime, css] = await Promise.all([
  readFile(new URL("../app/presentation/runtime/match-runtime-gate.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/runtime/hero-panel-expand-runtime.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/hero-panel-reference-tuning.css", import.meta.url), "utf8"),
]);

test("compact hero metadata is match-gated and never intercepts interaction", () => {
  assert.match(gate, /<HeroPanelExpandRuntime\s*\/>/);
  assert.match(runtime, /classList\.remove\("is-expanded"/);
  assert.doesNotMatch(runtime, /addEventListener\("(?:click|keydown)"/);
  assert.doesNotMatch(runtime, /aria-expanded|classList\.toggle/);
});

test("compact hero HUD hides full powers and keeps evolution under progress", () => {
  assert.match(css, /canonical-hero-panel:not\(\.is-expanded\)[\s\S]*?width:\s*min\(17\.7cqw, 30\.4cqh\)/);
  assert.match(css, /canonical-hero-panel\.player:not\(\.is-expanded\)[\s\S]*?height:\s*23\.05cqh/);
  assert.match(css, /canonical-hero-panel:not\(\.is-expanded\) > \.hero-command-bar[\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /player:not\(\.is-expanded\) > \.player-hero:not\(\.enemy\) > \.level-button[\s\S]*?top:\s*calc\(var\(--hero-card-level-top\) \+ var\(--hero-card-level-height\) \+ \.28cqh\)/);
});

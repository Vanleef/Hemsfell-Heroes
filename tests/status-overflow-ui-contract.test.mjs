import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8").replace(/\s+/g, " ");
const gate = fs.readFileSync("app/presentation/runtime/match-runtime-gate.tsx", "utf8").replace(/\s+/g, " ");
const abilityRuntime = fs.readFileSync("app/presentation/runtime/hero-ability-rail-runtime.tsx", "utf8").replace(/\s+/g, " ");
const statusRuntime = fs.readFileSync("app/presentation/runtime/status-overflow-runtime.tsx", "utf8").replace(/\s+/g, " ");
const css = fs.readFileSync("app/presentation/styles/hero-status-overlay.css", "utf8").replace(/\s+/g, " ");

function ruleBody(marker) {
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, `missing CSS rule: ${marker}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  assert.ok(open >= 0 && close > open, `malformed CSS rule: ${marker}`);
  return css.slice(open + 1, close);
}

test("status overlay loads after targeting while pile footer remains terminal", () => {
  const targeting = layout.indexOf('./presentation/styles/targeting-hero-ui-terminal.css');
  const status = layout.indexOf('./presentation/styles/hero-status-overlay.css');
  const pile = layout.indexOf('./presentation/styles/side-pile-text-shadow-terminal.css');
  assert.ok(targeting >= 0);
  assert.ok(status > targeting);
  assert.ok(pile > status);
  assert.match(gate, /import\("\.\/status-overflow-runtime"\)/);
  assert.match(gate, /<HeroAbilityRailRuntime \/> <StatusOverflowRuntime \/>/);
});

test("hero ability tooltip uses a body portal above every board stacking context", () => {
  assert.match(abilityRuntime, /const TOOLTIP_DELAY_MS = 1_000/);
  assert.match(abilityRuntime, /hero-ability-tooltip-portal/);
  assert.match(abilityRuntime, /document\.body/);
  assert.doesNotMatch(abilityRuntime, /hero-ability-orb-tooltip/);
  const globalTooltip = ruleBody("html body .hh-global-tooltip-portal {");
  assert.match(globalTooltip, /position: fixed !important/);
  assert.match(globalTooltip, /z-index: 2147483647 !important/);
  assert.match(globalTooltip, /isolation: isolate !important/);
});

test("hero ability number lives before the orb and the orb inherits lineage color", () => {
  assert.match(abilityRuntime, /hero-ability-orb-entry[^]*hero-ability-orb-level[^]*hero-ability-orb/);
  assert.match(abilityRuntime, /getPropertyValue\("--deck"\)/);
  assert.match(abilityRuntime, /"--hh-ability-lineage": lineage/);
  const entry = ruleBody("html body .screen-game .hero-ability-orb-entry {");
  assert.match(entry, /grid-template-columns:/);
  const level = ruleBody("html body .screen-game .hero-ability-orb-entry > .hero-ability-orb-level {");
  assert.match(level, /position: static !important/);
  assert.match(level, /text-align: right !important/);
  const orb = ruleBody("html body .screen-game .hero-ability-orb-entry > .hero-ability-orb {");
  assert.match(orb, /var\(--hh-ability-lineage\)/);
  const glyph = ruleBody("html body .screen-game .hero-ability-orb-entry .hero-ability-orb-glyph {");
  assert.match(glyph, /font-size: clamp\(1\.02rem/);
});

test("hero progression is the first compact strip at the top of the player panel", () => {
  assert.match(abilityRuntime, /--hh-hero-level-progress/);
  assert.match(abilityRuntime, /dataset\.hhLevelShort = `Nv\. \$\{levelNumber\}`/);
  assert.match(abilityRuntime, /dataset\.hhProgressCopy = `\$\{current\}\/\$\{target\}`/);
  const row = ruleBody(".hero-panel-stack.canonical-hero-panel.player > .player-hero > .hero-level-row {");
  assert.match(row, /top: var\(--hh-hero-progress-top\) !important/);
  assert.match(row, /grid-template-columns: max-content minmax\(0, 1fr\) !important/);
  const progress = ruleBody(".hero-panel-stack.canonical-hero-panel.player > .player-hero > .hero-level-row > .hero-evolution {");
  assert.match(progress, /var\(--hh-hero-level-progress, 0%\)/);
  assert.match(css, /content: "PRÓX\. NÍVEL " attr\(data-hh-progress-copy\) !important/);
});

test("hero active effects collapse to one total badge only above two effects", () => {
  assert.match(statusRuntime, /kind === "hero" \? originals\.length > 2 : originals\.length > 3/);
  assert.match(statusRuntime, /const hiddenStart = kind === "hero" \? 0 : 2/);
  assert.match(statusRuntime, /const hidden = kind === "hero" \? originals : originals\.slice\(hiddenStart\)/);
  assert.match(statusRuntime, /\.hero-status-cues/);
  assert.match(statusRuntime, /data-overflow-kind=\{group\.kind\}/);
});

test("card positive and negative rails keep two icons then count hidden overflow independently", () => {
  assert.match(statusRuntime, /\.field-negative-statuses/);
  assert.match(statusRuntime, /\.field-keywords/);
  assert.match(statusRuntime, /originals\.length > 3/);
  assert.match(statusRuntime, /originals\.slice\(hiddenStart\)/);
  assert.match(css, /data-overflow-kind="negative"/);
  assert.match(css, /data-overflow-kind="positive"/);
  assert.match(css, /\[data-hh-overflow-hidden="true"\][^{]*\{[^}]*display: none !important/);
});

test("overflow tooltip is interactive and each hidden effect exposes a nested semantic tooltip", () => {
  assert.match(statusRuntime, /const HOVER_DELAY_MS = 1_000/);
  assert.match(statusRuntime, /hh-status-list-tooltip/);
  assert.match(statusRuntime, /onPointerEnter=\{clearCloseTimer\}/);
  assert.match(statusRuntime, /hh-status-list-item/);
  assert.match(statusRuntime, /onPointerEnter=\{\(event\) => openDetail\(item, event\.currentTarget\)\}/);
  assert.match(statusRuntime, /hh-status-detail-tooltip/);
  assert.match(statusRuntime, /glossaryDescription\(label\)/);
  const list = ruleBody("html body .hh-status-list-tooltip {");
  assert.match(list, /pointer-events: auto !important/);
  const detail = ruleBody("html body .hh-status-detail-tooltip {");
  assert.match(detail, /pointer-events: none !important/);
});

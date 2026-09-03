import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8").replace(/\s+/g, " ");
const railRuntime = fs.readFileSync("app/presentation/runtime/hero-ability-rail-runtime.tsx", "utf8").replace(/\s+/g, " ");
const panelRuntime = fs.readFileSync("app/presentation/runtime/hero-panel-expand-runtime.tsx", "utf8").replace(/\s+/g, " ");
const css = fs.readFileSync("app/presentation/styles/hero-hud-merge-regression-final.css", "utf8").replace(/\s+/g, " ");
const terminalCss = fs.readFileSync("app/presentation/styles/hero-ability-progress-tooltip-terminal.css", "utf8").replace(/\s+/g, " ");

const ruleBodyFrom = (sheet, marker) => {
  const start = sheet.indexOf(marker);
  assert.notEqual(start, -1, `missing CSS rule: ${marker}`);
  const open = sheet.indexOf("{", start);
  const close = sheet.indexOf("}", open);
  assert.ok(open >= 0 && close > open, `malformed CSS rule: ${marker}`);
  return sheet.slice(open + 1, close);
};

const ruleBody = (marker) => ruleBodyFrom(css, marker);
const terminalRuleBody = (marker) => ruleBodyFrom(terminalCss, marker);

test("merged hero HUD corrections load after targeting/status authorities and before pile terminal", () => {
  const targeting = layout.indexOf('./presentation/styles/targeting-hero-ui-terminal.css');
  const status = layout.indexOf('./presentation/styles/hero-status-overlay.css');
  const guard = layout.indexOf('./presentation/styles/hero-hud-merge-regression-final.css');
  const correction = layout.indexOf('./presentation/styles/hero-ability-progress-tooltip-terminal.css');
  const pile = layout.indexOf('./presentation/styles/side-pile-text-shadow-terminal.css');
  assert.ok(targeting >= 0);
  assert.ok(status > targeting);
  assert.ok(guard > status);
  assert.ok(correction > guard);
  assert.ok(pile > correction);
});

test("ability shortcut descriptions use body portal coordinates that survive the global inset reset", () => {
  assert.match(railRuntime, /const TOOLTIP_DELAY_MS = 1_000/);
  assert.match(railRuntime, /hero-ability-tooltip-portal/);
  assert.match(railRuntime, /document\.body/);
  assert.match(railRuntime, /"--hh-tooltip-left": `\$\{tooltip\.left\}px`/);
  assert.match(railRuntime, /"--hh-tooltip-top": `\$\{tooltip\.top\}px`/);
  assert.match(railRuntime, /"--hh-tooltip-width": `\$\{tooltip\.width\}px`/);

  const portal = terminalRuleBody("html body .hh-global-tooltip-portal.hero-ability-tooltip-portal {");
  assert.match(portal, /top: var\(--hh-tooltip-top, 0px\) !important/);
  assert.match(portal, /left: var\(--hh-tooltip-left, 0px\) !important/);
  assert.match(portal, /right: auto !important/);
  assert.match(portal, /bottom: auto !important/);
  assert.match(portal, /width: var\(--hh-tooltip-width/);
  assert.match(portal, /z-index: 2147483647 !important/);
});

test("only learned available active powers from the local hero are clickable", () => {
  assert.match(railRuntime, /const owned = panel\.classList\.contains\("player"\) && !panel\.classList\.contains\("enemy"\)/);
  assert.match(railRuntime, /const locked = source\.classList\.contains\("is-locked"\) \|\| source\.classList\.contains\("locked"\)/);
  assert.match(railRuntime, /const available = owned && active && !locked && source\.classList\.contains\("is-available"\) && source\.getAttribute\("aria-disabled"\) !== "true"/);
  assert.match(railRuntime, /ability\.available \? \( <button/);
  assert.match(railRuntime, /\) : \( <span className="hero-ability-orb"/);
  assert.match(railRuntime, /role="img" tabIndex=\{0\}/);
  assert.match(railRuntime, /ability\.source\.click\(\)/);

  assert.match(panelRuntime, /const owned = panel\.classList\.contains\("player"\) && !panel\.classList\.contains\("enemy"\)/);
  assert.match(panelRuntime, /const informational = !owned \|\| passive \|\| locked/);
  assert.match(panelRuntime, /ability\.disabled = informational/);
  assert.match(panelRuntime, /ability\.tabIndex = informational \? -1 : 0/);
  assert.doesNotMatch(panelRuntime, /ability\.disabled = ability\.getAttribute\("aria-disabled"\) === "true"/);

  const informational = terminalRuleBody('html body .screen-game .hero-ability-orb[data-available="false"] {');
  assert.match(informational, /cursor: help !important/);
});

test("local hero progress remains above the panel as one compact meter", () => {
  const row = ruleBody("> .hero-panel-stack.canonical-hero-panel.player > .player-hero > .hero-level-row {");
  assert.match(row, /top: auto !important/);
  assert.match(row, /bottom: calc\(100% \+ var\(--hh-player-progress-gap\)\) !important/);
  assert.match(row, /opacity: 1 !important/);
  assert.match(row, /visibility: visible !important/);

  const compactRow = terminalRuleBody("> .hero-panel-stack.canonical-hero-panel.player > .player-hero > .hero-level-row {");
  assert.match(compactRow, /grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(compactRow, /height: var\(--hh-player-progress-height\) !important/);
  assert.match(compactRow, /min-height: 0 !important/);
  assert.match(compactRow, /max-height: var\(--hh-player-progress-height\) !important/);

  const level = terminalRuleBody("> .hero-panel-stack.canonical-hero-panel.player > .player-hero > .hero-level-row > .hero-level {");
  assert.match(level, /display: none !important/);

  const evolution = terminalRuleBody("> .hero-level-row > .hero-evolution {");
  assert.match(evolution, /height: 100% !important/);
  assert.match(evolution, /min-height: 0 !important/);
  assert.match(evolution, /max-height: 100% !important/);
  assert.match(evolution, /overflow: hidden !important/);

  const legacy = terminalRuleBody("> .hero-level-row > .hero-evolution > :is(.hero-evolution-copy, .evolution-track) {");
  assert.match(legacy, /display: none !important/);
  assert.match(legacy, /visibility: hidden !important/);

  const label = terminalRuleBody("> .hero-level-row > .hero-evolution::after {");
  assert.match(label, /position: absolute !important/);
  assert.match(label, /inset: 0 !important/);
  assert.match(label, /place-items: center !important/);
});

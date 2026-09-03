import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8").replace(/\s+/g, " ");
const railRuntime = fs.readFileSync("app/presentation/runtime/hero-ability-rail-runtime.tsx", "utf8").replace(/\s+/g, " ");
const panelRuntime = fs.readFileSync("app/presentation/runtime/hero-panel-expand-runtime.tsx", "utf8").replace(/\s+/g, " ");
const css = fs.readFileSync("app/presentation/styles/hero-hud-merge-regression-final.css", "utf8").replace(/\s+/g, " ");

const ruleBody = (marker) => {
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, `missing CSS rule: ${marker}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  assert.ok(open >= 0 && close > open, `malformed CSS rule: ${marker}`);
  return css.slice(open + 1, close);
};

test("merged hero HUD guard loads after targeting/status authorities and before pile terminal", () => {
  const targeting = layout.indexOf('./presentation/styles/targeting-hero-ui-terminal.css');
  const status = layout.indexOf('./presentation/styles/hero-status-overlay.css');
  const guard = layout.indexOf('./presentation/styles/hero-hud-merge-regression-final.css');
  const pile = layout.indexOf('./presentation/styles/side-pile-text-shadow-terminal.css');
  assert.ok(targeting >= 0);
  assert.ok(status > targeting);
  assert.ok(guard > status);
  assert.ok(pile > guard);
});

test("ability shortcut descriptions use the body-level tooltip portal", () => {
  assert.match(railRuntime, /const TOOLTIP_DELAY_MS = 1_000/);
  assert.match(railRuntime, /hero-ability-tooltip-portal/);
  assert.match(railRuntime, /document\.body/);
  const portal = ruleBody("html body .hh-global-tooltip-portal.hero-ability-tooltip-portal {");
  assert.match(portal, /display: block !important/);
  assert.match(portal, /opacity: 1 !important/);
  assert.match(portal, /visibility: visible !important/);
  assert.match(portal, /z-index: 2147483647 !important/);
});

test("passive hero powers are informational and cannot acquire native activation behavior", () => {
  assert.match(railRuntime, /const available = active && source\.classList\.contains\("is-available"\) && source\.getAttribute\("aria-disabled"\) !== "true"/);
  assert.match(railRuntime, /aria-disabled=\{!ability\.available\}/);
  assert.match(railRuntime, /if \(!ability\.available\) return; ability\.source\.click\(\)/);
  assert.match(panelRuntime, /const passive = ability\.classList\.contains\("is-passive"\)/);
  assert.match(panelRuntime, /ability\.disabled = passive/);
  assert.doesNotMatch(panelRuntime, /ability\.disabled = ability\.getAttribute\("aria-disabled"\) === "true"/);
  const passive = ruleBody('html body .screen-game .hero-ability-orb[data-passive="true"] {');
  assert.match(passive, /cursor: help !important/);
});

test("local hero level progress is forced above the compact panel after all merged hero styles", () => {
  const row = ruleBody("> .hero-panel-stack.canonical-hero-panel.player > .player-hero > .hero-level-row {");
  assert.match(row, /top: auto !important/);
  assert.match(row, /bottom: calc\(100% \+ var\(--hh-player-progress-gap\)\) !important/);
  assert.match(row, /display: grid !important/);
  assert.match(row, /opacity: 1 !important/);
  assert.match(row, /visibility: visible !important/);

  const evolution = ruleBody("> .player-hero:not(.level-ready) > .hero-level-row > .hero-evolution {");
  assert.match(evolution, /display: grid !important/);
  assert.match(evolution, /opacity: 1 !important/);
  assert.match(evolution, /visibility: visible !important/);

  const evolveButton = ruleBody("> .hero-panel-stack.canonical-hero-panel.player > .player-hero > .level-button {");
  assert.match(evolveButton, /top: auto !important/);
  assert.match(evolveButton, /bottom: calc\(100% \+ var\(--hh-player-progress-gap\)\) !important/);
});

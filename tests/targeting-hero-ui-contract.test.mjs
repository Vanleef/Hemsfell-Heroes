import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/targeting-hero-ui-terminal.css", "utf8").replace(/\s+/g, " ");
const decisionLane = fs.readFileSync("app/presentation/styles/decision-lane-position.css", "utf8").replace(/\s+/g, " ");
const runtime = fs.readFileSync("app/presentation/runtime/hero-ability-rail-runtime.tsx", "utf8").replace(/\s+/g, " ");
const previewRuntime = fs.readFileSync("app/presentation/cards/card-preview-runtime.tsx", "utf8").replace(/\s+/g, " ");
const page = fs.readFileSync("app/page.tsx", "utf8").replace(/\s+/g, " ");

const ruleBody = (sheet, marker) => {
  const start = sheet.indexOf(marker);
  assert.notEqual(start, -1, `missing CSS rule: ${marker}`);
  const open = sheet.indexOf("{", start);
  const close = sheet.indexOf("}", open);
  assert.ok(open >= 0 && close > open, `malformed CSS rule: ${marker}`);
  return sheet.slice(open + 1, close);
};

test("targeting hero UI layer loads after match visuals while pile footer remains final", () => {
  const imports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  const visual = imports.indexOf("./presentation/styles/match-visual-terminal.css");
  const targeting = imports.indexOf("./presentation/styles/targeting-hero-ui-terminal.css");
  const pile = imports.indexOf("./presentation/styles/side-pile-text-shadow-terminal.css");
  assert.ok(visual >= 0);
  assert.ok(targeting > visual);
  assert.ok(pile > targeting);
  assert.equal(imports.at(-1), "./presentation/styles/side-pile-text-shadow-terminal.css");
  assert.match(layout, /import HeroAbilityRailRuntime from "\.\/presentation\/runtime\/hero-ability-rail-runtime"/);
  assert.match(layout, /<HeroPanelExpandRuntime \/>\s*<HeroAbilityRailRuntime \/>/);
});

test("mulligan uses only the delayed canonical Floating UI card tooltip", () => {
  assert.match(previewRuntime, /const TOOLTIP_HOVER_DELAY_MS = 1_000/);
  assert.match(page, /mulligan-card-static[^]*?<OriginalCard card=\{card\} small inspectable\/>/);
  const mulliganRule = ruleBody(css, ".mulligan-card-static .card-tooltip");
  assert.match(mulliganRule, /display: none !important/);
  assert.match(mulliganRule, /visibility: hidden !important/);
  assert.match(mulliganRule, /opacity: 0 !important/);
  assert.match(css, /mulligan-card-static \.original-card:hover > \.card-tooltip,[^}]*mulligan-card-static \.original-card:focus-visible > \.card-tooltip[^}]*display: none !important/);
  assert.doesNotMatch(css, /mulligan-card-static[^}]*hover[^}]*display:\s*flex !important/);
});

test("all target surfaces share one board spotlight and defense keeps its dedicated flow", () => {
  assert.match(css, /hs-board:not\(:has\(> \.defense-decision\)\):has\(:is\(\.target-ally, \.target-enemy, \.placement-target\)\)/);
  assert.match(css, /:is\(\.original-card\.target-ally, \.player-hero\.target-ally, \.placement-target\)[^}]*brightness\(1\.12\)[^}]*opacity: 1 !important/);
  assert.match(css, /:is\(\.original-card\.target-enemy, \.player-hero\.target-enemy\)[^}]*brightness\(1\.12\)[^}]*opacity: 1 !important/);
  assert.match(css, /player-field, \.enemy-field\):not\(:has\(:is\(\.target-ally, \.target-enemy, \.placement-target\)\)\)[^}]*brightness\(\.6\)[^}]*opacity: \.8 !important/);
  assert.match(css, /field-slot:not\(\.placement-target\):not\(:has\(:is\(\.target-ally, \.target-enemy, \.placement-target\)\)\)[^}]*brightness\(\.6\)/);
  assert.match(css, /field-slot\.placement-target,[^}]*field-slot:has\(:is\(\.target-ally, \.target-enemy, \.placement-target\)\)[^}]*filter: none !important[^}]*opacity: 1 !important/);
});

test("authoritative activation target decisions expose their legal ids and keep their parent layer above targets", () => {
  assert.match(page, /\["targets","activation-targets"\]\.includes\(engineDecision\.kind\)/);
  assert.match(page, /const engineTargetIds=engineTargetOptions\.map\(option=>option\.id\)/);
  assert.match(page, /ruleTargetIds=\{forcedAttackDecision\?forcedAttackOptions\.map\(card=>card\.uid\):engineTargetIds\}/);
  assert.match(page, /engineTargetIds\.includes\("enemy-hero"\)\?"target-enemy"/);
  assert.match(page, /engineTargetIds\.includes\("ally-hero"\)\?"target-ally"/);
  assert.match(css, /engine-target-decision-backdrop[^}]*background: transparent !important[^}]*pointer-events: none !important/);
  assert.match(css, /engine-target-decision-panel[^}]*pointer-events: auto !important[^}]*opacity: 1 !important/);
  assert.match(decisionLane, /engine-decision-backdrop\.engine-target-decision-backdrop[^}]*z-index: 2147482070 !important[^}]*isolation: isolate !important/);
});

test("evolution progress and action are docked above the measured hero art without a banner", () => {
  const hiddenBanner = ruleBody(css, ".evolution-available::before");
  assert.match(hiddenBanner, /content: none !important/);
  assert.match(hiddenBanner, /display: none !important/);
  const levelRow = ruleBody(css, ".player-hero > .hero-level-row");
  assert.match(levelRow, /position: absolute !important/);
  assert.match(levelRow, /top: calc\(var\(--hh-hero-art-top, 0px\) - clamp\(/);
  assert.match(levelRow, /bottom: auto !important/);
  const evolve = ruleBody(css, ".player-hero > .level-button");
  assert.match(evolve, /position: absolute !important/);
  assert.match(evolve, /top: calc\(var\(--hh-hero-art-top, 0px\) - clamp\(/);
  assert.match(evolve, /bottom: auto !important/);
});

test("three ability shortcuts stay portrait anchored and mirror the real ability buttons", () => {
  assert.match(runtime, /querySelectorAll<HTMLButtonElement>\(CHIP_SELECTOR\)\)\.slice\(0, 3\)/);
  assert.match(runtime, /const portrait = liveHero\?\.querySelector<HTMLElement>\("\.hero-portrait"\)/);
  assert.match(runtime, /Math\.max\(artRight, heroRect\.width\)/);
  assert.match(runtime, /--hh-hero-art-top/);
  assert.match(runtime, /--hh-hero-art-right/);
  assert.match(runtime, /if \(!ability\.available\) return; ability\.source\.click\(\)/);
  assert.match(runtime, /createPortal\([^]*hero-ability-rail[^]*hero,/);
});

test("ability shortcut states and one-second description tooltip are explicit", () => {
  const locked = ruleBody(css, '.hero-ability-orb[data-locked="true"]');
  assert.match(locked, /grayscale\(1\) saturate\(0\) brightness\(\.64\)/);
  assert.match(locked, /opacity: \.5 !important/);
  assert.match(css, /hero-ability-orb\[data-active="true"\]\[data-available="true"\][^}]*cursor: pointer !important/);
  assert.match(css, /hero-ability-orb:hover > \.hero-ability-orb-tooltip,[^}]*hero-ability-orb:focus-visible > \.hero-ability-orb-tooltip[^}]*transition-delay: 1s, 1s, 1s !important/);
  assert.match(runtime, /data-locked=\{ability\.locked \? "true" : "false"\}/);
  assert.match(runtime, /data-passive=\{ability\.passive \? "true" : "false"\}/);
});

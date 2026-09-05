import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8").replace(/\s+/g, " ");
const gate = fs.readFileSync("app/presentation/runtime/match-runtime-gate.tsx", "utf8").replace(/\s+/g, " ");
const runtime = fs.readFileSync("app/presentation/runtime/mobile-touch-input-runtime.tsx", "utf8").replace(/\s+/g, " ");
const heroRuntime = fs.readFileSync("app/presentation/runtime/hero-panel-expand-runtime.tsx", "utf8").replace(/\s+/g, " ");
const css = fs.readFileSync("app/presentation/styles/mobile-touch-layout-terminal.css", "utf8").replace(/\s+/g, " ");

function ruleBody(marker) {
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, `missing CSS rule: ${marker}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  assert.ok(open >= 0 && close > open, `malformed CSS rule: ${marker}`);
  return css.slice(open + 1, close);
}

test("mobile touch runtime and CSS are mounted late without displacing the pile terminal", () => {
  const targeting = layout.indexOf('./presentation/styles/targeting-hero-ui-terminal.css');
  const mobileTerminal = layout.indexOf('./presentation/styles/mobile-touch-layout-terminal.css');
  const pileTerminal = layout.indexOf('./presentation/styles/side-pile-text-shadow-terminal.css');
  assert.ok(targeting >= 0);
  assert.ok(mobileTerminal > targeting);
  assert.ok(pileTerminal > mobileTerminal);
  assert.match(gate, /import\("\.\/mobile-touch-input-runtime"\)/);
  assert.match(gate, /<PhaseActionRuntime \/> <MobileTouchInputRuntime \/>/);
});

test("coarse pointer drag reuses the real React drag/drop contract with stable pointer capture", () => {
  assert.match(runtime, /DRAG_SOURCE_SELECTOR = "\.screen-game \[draggable='true'\]"/);
  assert.match(runtime, /DROP_ZONE_SELECTOR = "\.screen-game \.field-slot, \.screen-game \.terrain-slot"/);
  assert.match(runtime, /class TouchDataTransfer/);
  assert.match(runtime, /setPointerCapture\(event\.pointerId\)/);
  assert.match(runtime, /hasPointerCapture\(event\.pointerId\)/);
  assert.match(runtime, /dispatchDrag\(current\.source, "dragstart"/);
  assert.match(runtime, /dispatchDrag\(target, "drop"/);
  assert.match(runtime, /dispatchDrag\(current\.source, "dragend"/);
  assert.match(runtime, /Math\.hypot[\s\S]*DRAG_THRESHOLD_PX/);
  assert.match(runtime, /requestAnimationFrame/);
});

test("touch drop hit-testing sees through card overlays and asks the real dragover handler for legality", () => {
  assert.match(runtime, /document\.elementsFromPoint\(point\.x, point\.y\)/);
  assert.match(runtime, /element\.closest<HTMLElement>\(DROP_ZONE_SELECTOR\)/);
  assert.match(runtime, /zone\.classList\.contains\("can-drop"\)/);
  assert.match(runtime, /dispatchDrag\(zone, "dragover", dataTransfer, point\)/);
  assert.match(runtime, /source\.style\.setProperty\("pointer-events", "none", "important"\)/);
  assert.match(runtime, /restoreSource/);
});

test("trusted browser drag is suppressed while the coarse-pointer bridge owns the session", () => {
  assert.match(runtime, /onNativeDragStartCapture/);
  assert.match(runtime, /!session \|\| !event\.isTrusted/);
  assert.match(runtime, /event\.preventDefault\(\)/);
  assert.match(runtime, /event\.stopImmediatePropagation\(\)/);
  assert.match(runtime, /addEventListener\("dragstart", onNativeDragStartCapture, true\)/);
});

test("touch taps have a guarded click fallback without turning inspection holds into clicks", () => {
  assert.match(runtime, /TAP_FALLBACK_DELAY_MS = 32/);
  assert.match(runtime, /TAP_MAX_DURATION_MS = 520/);
  assert.match(runtime, /lastClickControl === control/);
  assert.match(runtime, /if \(!nativeClickArrived\) control\.click\(\)/);
  assert.match(runtime, /suppressClicksUntil/);
});

test("mobile drag disables browser gesture stealing only on draggable gameplay cards", () => {
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /\.player-hand \.original-card\[draggable="true"\][^{]*\{[^}]*touch-action: none !important/);
  assert.match(css, /\.arte-reposition-active \.original-card\[draggable="true"\][^{]*\{[^}]*touch-action: none !important/);
  assert.match(css, /button,[^}]*\[role="button"\][^{]*\{[^}]*touch-action: manipulation !important/);
});

test("immersive landscape reduces HUD density without scaling the whole board", () => {
  assert.match(css, /max-aspect-ratio: 12 \/ 5/);
  assert.match(css, /--hh-mobile-density: \.84/);
  assert.match(css, /--hh-mobile-energy-density: \.8/);
  assert.match(css, /> \.canonical-hero-panel[^}]*scale: var\(--hh-mobile-density\) !important/);
  assert.match(css, /> :is\(\.enemy-field,\.player-field\)[^}]*scale: var\(--hh-mobile-density\) !important/);
  assert.match(css, /> \.player-hand[^}]*scale: var\(--hh-mobile-density\) !important/);
  const boardVars = ruleBody("html body .screen-game .game-stage > .game-content.hs-board {");
  assert.doesNotMatch(boardVars, /\bscale\s*:/);
});

test("landscape maintenance overrides portrait legacy stacking and remains inside viewport", () => {
  assert.match(css, /\.maintenance\.maintenance-dialog[^}]*width: min\(42rem, 80dvw\) !important[^}]*max-height: calc\(100dvh/);
  assert.match(css, /\.maintenance-status[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(css, /\.maintenance-options[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(css, /\.maintenance-choice[^}]*min-height: 0 !important[^}]*height: auto !important/);
});

test("coarse pointers never expand ability prose inline over the battlefield", () => {
  assert.match(heroRuntime, /classList\.remove\("is-expanded"\)/);
  assert.doesNotMatch(heroRuntime, /addEventListener\("click"/);
  assert.match(css, /canonical-hero-panel\.is-expanded[^}]*hero-ability-copy > :is\(b,p\)[^{]*\{[^}]*display: none !important/);
});

test("opponent turn is compact status rather than a primary action plate on touch", () => {
  assert.match(css, /\.phase-orb:empty\s*\{[^}]*width: clamp\(6\.4rem, 8\.65cqw, 8\.8rem\) !important/);
  assert.match(css, /\.phase-orb:empty::before\s*\{[^}]*min-height: clamp\(2rem, 4\.55cqh, 2\.65rem\) !important/);
});

test("touch landscape keeps hand readable and bottom-right controls inside the safe edge", () => {
  assert.match(css, /> \.player-hand\s*\{[^}]*scale: \.9 !important[^}]*translate: 0 -1\.05cqh !important/);
  assert.match(css, /> \.player-hand :is\(\.card-frame,\.original-card\)[^{]*\{[^}]*width: clamp\(3\.35rem, 6\.15cqw, 6\.35rem\) !important/);
  assert.match(css, /> \.phase-orb:not\(:empty\)\s*\{[^}]*width: clamp\(7\.35rem, 9\.45cqw, 10\.1rem\) !important[^}]*scale: \.8 !important/);
  assert.match(css, /> \.surrender-button\s*\{[^}]*scale: \.76 !important[^}]*translate: -1cqw -\.55cqh !important[^}]*safe-area-inset-right/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8").replace(/\s+/g, " ");
const runtime = fs.readFileSync("app/presentation/runtime/mobile-touch-input-runtime.tsx", "utf8").replace(/\s+/g, " ");
const css = fs.readFileSync("app/presentation/styles/mobile-touch-layout-terminal.css", "utf8").replace(/\s+/g, " ");

test("mobile touch runtime and CSS are mounted as terminal match authorities", () => {
  const previousTerminal = layout.indexOf('./presentation/styles/side-pile-text-shadow-terminal.css');
  const mobileTerminal = layout.indexOf('./presentation/styles/mobile-touch-layout-terminal.css');
  assert.ok(previousTerminal >= 0);
  assert.ok(mobileTerminal > previousTerminal);
  assert.match(layout, /import MobileTouchInputRuntime from "\.\/presentation\/runtime\/mobile-touch-input-runtime"/);
  assert.match(layout, /<PhaseActionRuntime \/> <MobileTouchInputRuntime \/>/);
});

test("coarse pointer drag reuses native React drag and drop handlers", () => {
  assert.match(runtime, /DRAG_SOURCE_SELECTOR = "\.screen-game \[draggable='true'\]"/);
  assert.match(runtime, /DROP_TARGET_SELECTOR = "\.screen-game \.field-slot\.can-drop, \.screen-game \.terrain-slot\.can-drop"/);
  assert.match(runtime, /class TouchDataTransfer/);
  assert.match(runtime, /dispatchDrag\(session\.source, "dragstart"/);
  assert.match(runtime, /dispatchDrag\(target, "drop"/);
  assert.match(runtime, /dispatchDrag\(session\.source, "dragend"/);
  assert.match(runtime, /Math\.hypot[\s\S]*DRAG_THRESHOLD_PX/);
  assert.match(runtime, /requestAnimationFrame/);
});

test("touch taps have a guarded click fallback without turning inspection holds into clicks", () => {
  assert.match(runtime, /TAP_FALLBACK_DELAY_MS = 220/);
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
  assert.doesNotMatch(css, /\.game-content\.hs-board[^}]*scale:\s*var\(--hh-mobile-density\)/);
});

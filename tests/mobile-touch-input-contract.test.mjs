import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/mobile-touch-input-runtime.tsx", "utf8");
const gate = fs.readFileSync("app/presentation/runtime/match-runtime-gate.tsx", "utf8");
const mobileGate = fs.readFileSync("app/presentation/runtime/mobile-match-runtime-gate.tsx", "utf8");

test("mobile input runtime is mounted after phase controls through a coarse-pointer gate", () => {
  const normalized = gate.replace(/\s+/g, " ");
  assert.match(normalized, /<PhaseActionRuntime \/> <MobileMatchRuntimeGate \/>/);
  assert.match(gate, /import\("\.\/mobile-match-runtime-gate"\)/);
  assert.doesNotMatch(gate, /import\("\.\/mobile-touch-input-runtime"\)/);
  assert.match(mobileGate, /COARSE_POINTER_QUERY = "\(any-pointer: coarse\)"/);
  assert.match(mobileGate, /import\("\.\/mobile-touch-input-runtime"\)/);
  assert.match(mobileGate, /return active \? <MobileTouchInputRuntime \/> : null/);
});

test("touch drag reuses React drag handlers but caches geometry instead of hit-testing the whole DOM every move", () => {
  assert.match(runtime, /type DropCandidate = \{ zone: HTMLElement; rect: DOMRectReadOnly \}/);
  assert.match(runtime, /collectDropCandidates\(current\.dataTransfer\)/);
  assert.match(runtime, /matchingDropZone\(current\.dropCandidates, point\)/);
  assert.match(runtime, /pointInside\(candidate\.rect, point\)/);
  assert.doesNotMatch(runtime, /elementsFromPoint/);
  assert.match(runtime, /dispatchDrag\(source, "dragstart"/);
  assert.match(runtime, /dispatchDrag\(target, "drop"/);
});

test("tap fallback is immediate and suppresses only the later trusted compatibility click", () => {
  assert.match(runtime, /control\.click\(\)/);
  assert.match(runtime, /suppressClicksUntil = upAt \+ 360/);
  assert.match(runtime, /if \(!event\.isTrusted \|\| performance\.now\(\) >= suppressClicksUntil\) return/);
  assert.doesNotMatch(runtime, /TAP_FALLBACK_DELAY_MS/);
  assert.doesNotMatch(runtime, /setTimeout\([^\n]*control\.click/);
});

test("touch inspection and drag share one pointer session with movement cancellation", () => {
  assert.match(runtime, /INSPECTION_HOLD_MS = 1_000/);
  assert.match(runtime, /HOLD_SLOP_PX = 12/);
  assert.match(runtime, /if \(distance > HOLD_SLOP_PX\) clearInspectionHold\(current\)/);
  assert.match(runtime, /if \(!current\.dragging && !current\.inspected && current\.source && distance >= DRAG_THRESHOLD_PX\) beginDrag/);
  assert.match(runtime, /hemsfell:inspect-card/);
});

test("gesture cleanup releases pointer capture, rAF, drag classes and inspection timers", () => {
  assert.match(runtime, /clearInspectionHold\(current\)/);
  assert.match(runtime, /cancelAnimationFrame\(current\.syncFrame\)/);
  assert.match(runtime, /releasePointerCapture/);
  assert.match(runtime, /classList\.remove\("hh-touch-drag-active"\)/);
  assert.match(runtime, /removeAttribute\("data-hh-touch-dragging"\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../app/presentation/runtime/game-presentation-runtime.tsx", import.meta.url), "utf8");

test("presentation state fingerprints are derived once per queued action and reused", () => {
  assert.match(runtime, /type UnitPresentationDiff =/);
  assert.match(runtime, /function buildUnitPresentationDiff\(detail: PresentationDetail\)/);
  assert.equal((runtime.match(/buildUnitPresentationDiff\(detail\)/g) || []).length, 1);
  assert.equal((runtime.match(/unitPresentationFingerprint\(/g) || []).length, 2);
  assert.match(runtime, /installStateGate\(unitDiff\)/);
  assert.match(runtime, /reserveChangedUnits\(layers\.motion, capturedDom, unitDiff\)/);
  assert.match(runtime, /holdChangedState\(layers\.motion, beforeDom, afterDom, detail, unitDiff, heldUnits\)/);
  assert.match(runtime, /changedTargetRects\(detail, beforeDom, afterDom, unitDiff\)/);
});

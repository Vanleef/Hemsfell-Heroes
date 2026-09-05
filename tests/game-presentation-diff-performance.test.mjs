import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../app/presentation/runtime/game-presentation-runtime.tsx", import.meta.url), "utf8");

test("presentation state fingerprints are derived once per queued action and reused", () => {
  assert.match(runtime, /type UnitPresentationDiff =/);
  assert.match(runtime, /unitDiff: UnitPresentationDiff/);
  assert.match(runtime, /function buildUnitPresentationDiff\(detail: PresentationDetail\)/);
  assert.equal((runtime.match(/buildUnitPresentationDiff\(detail\)/g) || []).length, 1);
  assert.equal((runtime.match(/unitPresentationFingerprint\(/g) || []).length, 2);
  assert.match(runtime, /installStateGate\(unitDiff\)/);
  assert.match(runtime, /reserveChangedUnits\(layers\.motion, capturedDom, unitDiff\)/);
  assert.match(runtime, /holdChangedState\(layers\.motion, beforeDom, afterDom, detail, unitDiff, heldUnits\)/);
  assert.match(runtime, /changedTargetRects\(detail, beforeDom, afterDom, unitDiff\)/);
  assert.doesNotMatch(runtime, /const oldState = stateUnitById\(detail\.before, uid\);\s*const freshState = stateUnitById\(detail\.after, uid\);/);

  const diffIndex = runtime.indexOf("const unitDiff = buildUnitPresentationDiff(detail);");
  const gateIndex = runtime.indexOf("const stateGate = installStateGate(unitDiff);");
  const reserveIndex = runtime.indexOf("const heldUnits = reserveChangedUnits(layers.motion, capturedDom, unitDiff);");
  assert.ok(diffIndex >= 0 && diffIndex < gateIndex && gateIndex < reserveIndex, "unit diff must be derived before presentation gates reserve visual state");
});

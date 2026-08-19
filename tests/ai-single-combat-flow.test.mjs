import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [combatPlanner, runtime, simulator] = await Promise.all([
  readFile(new URL("../app/rules-engine/ai-system/combat.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/rules-engine/ai-system/runtime.ts", import.meta.url), "utf8"),
  readFile(new URL("../scripts/simulate-games.mjs", import.meta.url), "utf8"),
]);

test("advanced AI planner returns at most one attacker and re-evaluates after each combat", () => {
  assert.match(combatPlanner, /chooseAttack\(state:/);
  assert.match(combatPlanner, /const chosen = this\.chooseAttack\(state, owner, profile\)/);
  assert.match(combatPlanner, /return chosen \? \[chosen\] : \[\]/);
  assert.match(combatPlanner, /const mandatory = attackers\.filter/);
  assert.match(combatPlanner, /mandatoryIds\.has\(plan\.attackerId\)/);
  assert.match(runtime, /controller\.planAttacks\(state, owner\)\.map/);
});

test("advanced AI defender evaluates one legal blocker for the current attacker", () => {
  assert.match(combatPlanner, /chooseBlock\(state:/);
  assert.match(combatPlanner, /listLegalBlockers\(state as any, owner, attacker\)/);
  assert.match(combatPlanner, /takeDamage: true/);
  assert.match(combatPlanner, /defenderId: idOf\(defender\)/);
});

test("headless simulation uses the same declare/block/resolve single-attack cycle", () => {
  assert.match(simulator, /type: "declareAttack"/);
  assert.match(simulator, /type: "selectDefender"/);
  assert.match(simulator, /state\.combatAction\?\.stage === "choosing"/);
  assert.match(simulator, /state\.combatAction\?\.stage === "charging"/);
  assert.match(simulator, /listPendingIndomitableAttackers/);
  assert.match(simulator, /canEndCombat/);
  assert.doesNotMatch(simulator, /type: "declareAttackers"/);
  assert.doesNotMatch(simulator, /type: "declareBlockers"/);
});

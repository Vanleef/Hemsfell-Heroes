import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCloneRetaliation,
  claimOncePerTurn,
  earthquakeDamage,
  elementalChainFrom,
} from "../app/game-rules.mjs";

test("Uruk elemental chain follows the declared successor order", () => {
  assert.deepEqual(elementalChainFrom("Terra"), { element: "Fogo", effect: "Sufocado" });
  assert.deepEqual(elementalChainFrom("Água"), { element: "Ar", effect: "Atordoado" });
  assert.deepEqual(elementalChainFrom("Ar"), { element: "Água", effect: "Congelado" });
  assert.deepEqual(elementalChainFrom("Fogo"), { element: "Terra", effect: "Imobilizado" });
});

test("Terremoto deals damage equal to the enemy creature count", () => {
  assert.equal(earthquakeDamage(0), 0);
  assert.equal(earthquakeDamage(3), 3);
  assert.equal(earthquakeDamage(5), 5);
});

test("Clone de Água retaliates only against the creature that destroyed it", () => {
  const killer = { frozen: false, stunned: false, suffocated: false, exhausted: false, bonusAtk: 4, bonusHp: 3, markers: 2 };
  const untouched = { frozen: false, stunned: false, suffocated: false, exhausted: false, bonusAtk: 4, bonusHp: 3, markers: 2 };
  applyCloneRetaliation(killer, "Ao ser destruído, aplique Congelado e Sufocado.");
  assert.equal(killer.frozen, true);
  assert.equal(killer.suffocated, true);
  assert.equal(killer.bonusAtk, 0);
  assert.equal(killer.markers, 0);
  assert.deepEqual(untouched, { frozen: false, stunned: false, suffocated: false, exhausted: false, bonusAtk: 4, bonusHp: 3, markers: 2 });
});

test("spell triggers with a once-per-turn limit claim only the first cast", () => {
  const uses = {};
  assert.equal(claimOncePerTurn(uses, "athos-spell-unit-1"), true);
  assert.equal(claimOncePerTurn(uses, "athos-spell-unit-1"), false);
  assert.equal(claimOncePerTurn(uses, "another-trigger"), true);
});

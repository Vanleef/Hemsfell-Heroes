import test from "node:test";
import assert from "node:assert/strict";
import { resolvedCombatPresentation } from "../app/combat-presentation.mjs";

const card = (uid, name, extra = {}) => ({
  uid, id: uid, page: 1, name, type: "Criatura", text: "", tags: [],
  atk: 3, hp: 3, damage: 0, slot: 0, ...extra,
});

const state = () => ({
  players: [
    { life: 30, board: [card("attacker", "Atacante")] },
    { life: 30, board: [card("defender", "Defensor")] },
  ],
  combatAction: {
    attackerOwner: 0,
    attackerUid: "attacker",
    attackerCard: card("attacker", "Atacante"),
    defenderUid: "defender",
    defenderCard: card("defender", "Defensor"),
    targetHero: false,
    stage: "priority",
  },
});

test("authoritative combat remains available for animation after the server clears combatAction", () => {
  const before = state();
  const after = structuredClone(before);
  after.combatAction = null;
  after.players[1].board = [];

  const presentation = resolvedCombatPresentation(before, after);
  assert.equal(presentation.stage, "charging");
  assert.equal(presentation.attackerCard.name, "Atacante");
  assert.equal(presentation.defenderCard.name, "Defensor");
  assert.deepEqual(presentation.destroyed, ["defender"]);
  assert.match(presentation.winnerText, /VENCEU/);
});

test("direct flying-style attack records hero damage without requiring a defender", () => {
  const before = state();
  before.combatAction = {
    attackerOwner: 0,
    attackerUid: "attacker",
    attackerCard: card("attacker", "Dragão Voador", { tags: ["Voar", "Indomável"] }),
    targetHero: true,
    stage: "priority",
  };
  const after = structuredClone(before);
  after.combatAction = null;
  after.players[1].life = 27;

  const presentation = resolvedCombatPresentation(before, after);
  assert.equal(presentation.targetHero, true);
  assert.equal(presentation.attackDamage, 3);
  assert.equal(presentation.result, "3 de dano direto");
});

test("no presentation is synthesized while authoritative combat is still active", () => {
  const before = state();
  assert.equal(resolvedCombatPresentation(before, structuredClone(before)), null);
});

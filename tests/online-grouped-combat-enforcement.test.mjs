import assert from "node:assert/strict";
import test from "node:test";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";

const unit = (id, slot) => ({
  uid: id,
  id,
  name: id,
  type: "Criatura",
  slot,
  atk: 2,
  hp: 3,
  text: "",
  tags: [],
  abilities: [],
  modifiers: [],
  damage: 0,
  exhausted: false,
  summoning: false,
  stunned: false,
  immobilized: false,
  suffocated: false,
  defenseUses: 0,
  attackLimit: 1,
  attacksThisTurn: 0,
  attackedThisTurn: false,
  markers: 0,
});

const player = () => ({
  heroId: "saymon",
  level: 1,
  life: 30,
  maxLife: 30,
  energy: 0,
  maxEnergy: 3,
  reserve: 0,
  hand: [],
  deck: [],
  grave: [],
  obscuro: [],
  board: [],
  support: [],
  terrain: null,
  abilityUses: {},
  markers: {},
  heroXP: 0,
});

const groupedState = () => {
  const players = [player(), player()];
  players[0].board = [unit("attacker", 0)];
  return {
    active: 0,
    phase: "combate",
    round: 3,
    events: 0,
    winner: null,
    players,
    onlineCombat: {
      stage: "declare-attackers",
      attackerOwner: 0,
      attackers: [],
      blocks: [],
      resolutionIndex: 0,
    },
  };
};

test("legacy single-attacker declaration cannot escape Online v2 grouped combat", () => {
  const game = groupedState();
  assert.throws(
    () => executeOnlineCommand(game, { type: "declareAttack", owner: 0, attackerId: "attacker" }),
    /grouped-attack-declaration-required/,
  );
});

test("legacy phase advance cannot skip a pending grouped attacker declaration", () => {
  const game = groupedState();
  assert.throws(
    () => executeOnlineCommand(game, { type: "advancePhase", owner: 0 }),
    /grouped-combat-in-progress/,
  );
});

test("authoritative grouped declaration remains legal in the same state", () => {
  const game = executeOnlineCommand(groupedState(), { type: "declareAttackers", owner: 0, attackerIds: ["attacker"] }).state;
  assert.equal(game.onlineCombat.stage, "after-attackers");
  assert.equal(game.pendingResponse.responder, 1);
  assert.deepEqual(game.onlineCombat.attackers.map((entry) => entry.attackerId), ["attacker"]);
});

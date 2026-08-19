import assert from "node:assert/strict";
import test from "node:test";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";
import { canEndCombat, listAttackCapableCreatures, listLegalBlockers } from "../app/rules-engine/combat.mjs";

const unit = (id, slot, tags = []) => ({
  uid: id,
  id,
  name: id,
  type: "Criatura",
  slot,
  atk: 2,
  hp: 3,
  text: "",
  tags,
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
  extraDeck: [],
  grave: [],
  obscuro: [],
  board: [],
  support: [],
  terrain: null,
  abilityUses: {},
  markers: {},
  heroXP: 0,
});

const combatState = () => {
  const players = [player(), player()];
  players[0].board = [unit("attacker", 0), unit("next-attacker", 1)];
  players[1].board = [unit("blocker", 0)];
  return { active: 0, phase: "combate", round: 3, events: 0, winner: null, players };
};

const passAttackPriority = (game) => {
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  return executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
};

test("Online rejects the retired grouped combat commands", () => {
  const game = combatState();
  assert.throws(() => executeOnlineCommand(game, { type: "declareAttackers", owner: 0, attackerIds: ["attacker"] }), /grouped-combat-removed/);
  assert.throws(() => executeOnlineCommand(game, { type: "declareBlockers", owner: 1, assignments: [] }), /grouped-combat-removed/);
});

test("one attacker opens one defender decision and blocks further attacker actions", () => {
  let game = executeOnlineCommand(combatState(), { type: "declareAttack", owner: 0, attackerId: "attacker" }).state;
  assert.equal(game.combatAction.attackerUid, "attacker");
  assert.equal(game.combatAction.stage, "priority");
  assert.equal(game.pendingResponse.responder, 1);

  game = passAttackPriority(game);
  assert.equal(game.combatAction.stage, "choosing");
  assert.equal(game.pendingResponse, null);
  assert.throws(() => executeOnlineCommand(game, { type: "declareAttack", owner: 0, attackerId: "next-attacker" }), /combat-action-pending/);
  assert.throws(() => executeOnlineCommand(game, { type: "selectDefender", owner: 0, attackerId: "attacker", targetHero: true }), /defender-choice-unavailable/);
});

test("blocker selection is unitary and the selected attack resolves through the shared engine", () => {
  let game = executeOnlineCommand(combatState(), { type: "declareAttack", owner: 0, attackerId: "attacker" }).state;
  game = passAttackPriority(game);
  assert.deepEqual(listLegalBlockers(game, 1, "attacker").map((card) => card.uid), ["blocker"]);

  game = executeOnlineCommand(game, { type: "selectDefender", owner: 1, attackerId: "attacker", defenderId: "blocker", targetHero: false }).state;
  assert.equal(game.combatAction.stage, "charging");
  assert.equal(game.combatAction.defenderUid, "blocker");

  game = executeOnlineCommand(game, { type: "attack", owner: 0, attackerId: "attacker", defenderId: "blocker", skipPriority: true }).state;
  assert.equal(game.combatAction, null);
  assert.equal(game.players[0].board.find((card) => card.uid === "attacker").attacksThisTurn, 1);
  assert.equal(game.players[1].board.find((card) => card.uid === "blocker").damage, 2);
  assert.deepEqual(listAttackCapableCreatures(game, 0).map((card) => card.uid), ["next-attacker"]);
});

test("illegal blocker is rejected before combat enters charging", () => {
  let game = combatState();
  game.players[0].board = [unit("flying-attacker", 0, ["Voar"])];
  game.players[1].board = [unit("ground-blocker", 0)];
  game = executeOnlineCommand(game, { type: "declareAttack", owner: 0, attackerId: "flying-attacker" }).state;
  game = passAttackPriority(game);
  assert.deepEqual(listLegalBlockers(game, 1, "flying-attacker"), []);
  assert.throws(() => executeOnlineCommand(game, { type: "selectDefender", owner: 1, attackerId: "flying-attacker", defenderId: "ground-blocker", targetHero: false }), /invalid-defender/);
  assert.equal(game.combatAction.stage, "choosing");
});

test("no block sends only that attack to the defending hero", () => {
  let game = executeOnlineCommand(combatState(), { type: "declareAttack", owner: 0, attackerId: "attacker" }).state;
  game = passAttackPriority(game);
  game = executeOnlineCommand(game, { type: "selectDefender", owner: 1, attackerId: "attacker", targetHero: true }).state;
  assert.equal(game.combatAction.targetHero, true);
  game = executeOnlineCommand(game, { type: "attack", owner: 0, attackerId: "attacker", skipPriority: true }).state;
  assert.equal(game.players[1].life, 28);
  assert.equal(game.combatAction, null);
});

test("summoning sickness removes an attacker from the authoritative capability list", () => {
  const game = combatState();
  game.players[0].board[0].summoning = true;
  assert.deepEqual(listAttackCapableCreatures(game, 0).map((card) => card.uid), ["next-attacker"]);
});

test("Indomável keeps endCombat illegal until its legal attack is spent", () => {
  let game = combatState();
  game.players[0].board = [unit("must-attack", 0, ["Indomável"])];
  assert.equal(canEndCombat(game, 0), false);
  assert.throws(() => executeOnlineCommand(game, { type: "advancePhase", owner: 0 }), /indomitable-must-attack/);

  game = executeOnlineCommand(game, { type: "declareAttack", owner: 0, attackerId: "must-attack" }).state;
  game = passAttackPriority(game);
  game = executeOnlineCommand(game, { type: "selectDefender", owner: 1, attackerId: "must-attack", targetHero: true }).state;
  game = executeOnlineCommand(game, { type: "attack", owner: 0, attackerId: "must-attack", skipPriority: true }).state;
  assert.equal(canEndCombat(game, 0), true);
});

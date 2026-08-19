import assert from "node:assert/strict";
import test from "node:test";
import { executeOnlineCommand, onlinePriorityView } from "../app/rules-engine/online-priority-engine.mjs";
import { legalPriorityResponses } from "../app/rules-engine/priority.mjs";

const spell = (id, { accelerated = false } = {}) => ({ id, name: id, type: "Feitiço", cost: 0, text: accelerated ? "Acelerado" : "", tags: accelerated ? ["Acelerado"] : [], abilities: [] });
const unit = (id, slot, atk = 2, hp = 2, tags = []) => ({ uid: id, id, name: id, type: "Criatura", slot, atk, hp, text: "", tags, abilities: [], modifiers: [], damage: 0, exhausted: false, summoning: false, stunned: false, immobilized: false, suffocated: false, defenseUses: 0, attackLimit: 1, attacksThisTurn: 0, attackedThisTurn: false, markers: 0 });
const player = (hand = []) => ({ heroId: "saymon", level: 1, life: 30, maxLife: 30, energy: 3, maxEnergy: 3, reserve: 3, hand, deck: [], extraDeck: [], grave: [], obscuro: [], board: [], support: [], terrain: null, abilityUses: {}, markers: {}, heroXP: 0 });
const state = () => ({ active: 0, phase: "principal", round: 2, events: 0, winner: null, players: [player([spell("root"), spell("actor-fast", { accelerated: true })]), player([])] });
const combatState = () => {
  const game = state();
  game.phase = "combate";
  game.players[0].hand = [];
  game.players[0].board = [unit("a-left", 0, 2, 3), unit("a-right", 1, 3, 3)];
  game.players[1].board = [unit("blocker", 0, 1, 2)];
  return game;
};

const passTwice = (game, first, second) => {
  game = executeOnlineCommand(game, { type: "passPriority", owner: first }).state;
  return executeOnlineCommand(game, { type: "passPriority", owner: second }).state;
};

test("normal Online action hands response priority to the opponent", () => {
  const opened = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  assert.equal(opened.pendingResponse.responder, 1);
  assert.equal(opened.priority.model, "online-v2");
  assert.equal(opened.priority.mode, "response");
  assert.equal(opened.priority.owner, 1);
  assert.equal(onlinePriorityView(opened).stack.length, 1);
});

test("original actor may answer after one opponent pass and two passes resolve the top item", () => {
  let game = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.pendingResponse.responder, 0);
  assert.ok(legalPriorityResponses(game, 0).some((command) => command.cardId === "actor-fast"));
  game = executeOnlineCommand(game, { type: "playCard", owner: 0, cardId: "actor-fast" }).state;
  game = passTwice(game, 1, 0);
  assert.ok(game.players[0].grave.some((card) => card.id === "actor-fast"));
  assert.ok(game.players[0].hand.some((card) => card.id === "root"));
});

test("ending Main opens combat-start priority and then returns to unitary combat idle", () => {
  const clean = state();
  clean.players[0].hand = [];
  let game = executeOnlineCommand(clean, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.phase, "principal");
  assert.equal(game.priority.window, "main-end");
  game = passTwice(game, 1, 0);
  assert.equal(game.phase, "combate");
  assert.equal(game.priority.window, "combat-start");
  assert.equal(game.pendingResponse.responder, 0);
  game = passTwice(game, 0, 1);
  assert.equal(game.pendingResponse, null);
  assert.equal(game.onlineCombat, undefined);
  assert.equal(game.priority.mode, "action");
  assert.ok(onlinePriorityView(game).combatIdle);
});

test("each attacker creates its own priority, blocker choice and resolution before the next attacker", () => {
  let game = combatState();
  game = executeOnlineCommand(game, { type: "declareAttack", owner: 0, attackerId: "a-left" }).state;
  assert.equal(game.combatAction.stage, "priority");
  assert.equal(game.pendingResponse.responder, 1);
  game = passTwice(game, 1, 0);
  assert.equal(game.combatAction.stage, "choosing");

  game = executeOnlineCommand(game, { type: "selectDefender", owner: 1, attackerId: "a-left", defenderId: "blocker", targetHero: false }).state;
  assert.equal(game.combatAction.stage, "charging");
  game = executeOnlineCommand(game, { type: "attack", owner: 0, attackerId: "a-left", defenderId: "blocker", skipPriority: true }).state;
  assert.equal(game.combatAction, null);
  assert.ok(game.players[1].grave.some((card) => card.id === "blocker"));

  game = executeOnlineCommand(game, { type: "declareAttack", owner: 0, attackerId: "a-right" }).state;
  game = passTwice(game, 1, 0);
  game = executeOnlineCommand(game, { type: "selectDefender", owner: 1, attackerId: "a-right", targetHero: true }).state;
  game = executeOnlineCommand(game, { type: "attack", owner: 0, attackerId: "a-right", skipPriority: true }).state;
  assert.equal(game.players[1].life, 27);
  assert.equal(game.combatAction, null);
});

test("combat may end after unitary attacks and keeps Finalization banking semantics", () => {
  let game = combatState();
  game.players[0].board = [];
  game.players[1].board = [];
  game.players[0].energy = 2;
  game.players[0].reserve = 2;
  game = executeOnlineCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.phase, "combate");
  assert.equal(game.priority.window, "combat-end");
  game = passTwice(game, 1, 0);
  assert.equal(game.phase, "fim");
  assert.equal(game.players[0].energy, 0);
  assert.equal(game.players[0].reserve, 3);
  assert.equal(game.priority.window, "finalization");
  game = passTwice(game, 0, 1);
  assert.equal(game.phase, "manutencao");
  assert.equal(game.active, 1);
});

test("Indomável prevents the combat-end priority window until it attacks", () => {
  const game = combatState();
  game.players[0].board = [unit("must-attack", 0, 2, 2, ["Indomável"])];
  assert.throws(() => executeOnlineCommand(game, { type: "advancePhase", owner: 0 }), /indomitable-must-attack/);
  assert.equal(game.pendingResponse, undefined);
});

test("a response from the wrong player is rejected by the server kernel", () => {
  const opened = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  assert.throws(() => executeOnlineCommand(opened, { type: "passPriority", owner: 0 }), /not-your-priority/);
});

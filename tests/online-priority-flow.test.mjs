import assert from "node:assert/strict";
import test from "node:test";
import { executeOnlineCommand, onlinePriorityView } from "../app/rules-engine/online-priority-engine.mjs";
import { legalPriorityResponses } from "../app/rules-engine/priority.mjs";

const spell = (id, { accelerated = false } = {}) => ({
  id,
  name: id,
  type: "Feitiço",
  cost: 0,
  text: accelerated ? "Acelerado" : "",
  tags: accelerated ? ["Acelerado"] : [],
  abilities: [],
});

const unit = (id, slot, atk = 2, hp = 2, tags = []) => ({
  uid: id,
  id,
  name: id,
  type: "Criatura",
  slot,
  atk,
  hp,
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

const player = (hand = []) => ({
  heroId: "saymon",
  level: 1,
  life: 30,
  maxLife: 30,
  energy: 3,
  maxEnergy: 3,
  reserve: 3,
  hand,
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

const state = () => ({
  active: 0,
  phase: "principal",
  round: 2,
  events: 0,
  winner: null,
  players: [player([spell("root"), spell("actor-fast", { accelerated: true })]), player([])],
});

const combatState = () => {
  const game = state();
  game.phase = "combate";
  game.players[0].hand = [];
  game.players[0].board = [unit("a-left", 0, 2, 3), unit("a-right", 1, 3, 3)];
  game.players[1].board = [unit("blocker", 0, 1, 2)];
  return game;
};

test("normal Online action hands response priority to the opponent", () => {
  const opened = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  assert.equal(opened.phase, "principal");
  assert.equal(opened.pendingResponse.responder, 1);
  assert.equal(opened.priority.model, "online-v2");
  assert.equal(opened.priority.mode, "response");
  assert.equal(opened.priority.owner, 1);
  assert.equal(opened.priority.consecutivePasses, 0);
  assert.equal(onlinePriorityView(opened).stack.length, 1);
});

test("original actor may respond after opponent passes once only in Online v2", () => {
  let game = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.pendingResponse.responder, 0);
  assert.equal(game.pendingResponse.passes, 1);
  assert.ok(legalPriorityResponses(game, 0).some((command) => command.cardId === "actor-fast"));

  const legacy = state();
  legacy.pendingResponse = { responder: 0, actor: 0, action: "legacy", passes: 1 };
  legacy.players[0].hand = [spell("legacy-fast", { accelerated: true })];
  assert.equal(legalPriorityResponses(legacy, 0).length, 0, "Bot/Offline keeps the anti-loop pass guard");

  game = executeOnlineCommand(game, { type: "playCard", owner: 0, cardId: "actor-fast" }).state;
  assert.equal(game.pendingResponse.responder, 1);
  assert.equal(game.pendingResponse.passes, 0);
  assert.equal(game.priorityStack.length, 2);
});

test("two consecutive passes resolve only the top stack item then restart with active player", () => {
  let game = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  game = executeOnlineCommand(game, { type: "playCard", owner: 0, cardId: "actor-fast" }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;

  assert.ok(game.players[0].grave.some((card) => card.id === "actor-fast"));
  assert.ok(game.players[0].hand.some((card) => card.id === "root"), "root action must still be unresolved");
  assert.equal(game.pendingResponse.responder, 0, "active player starts the fresh response cycle");
  assert.equal(game.pendingResponse.passes, 0);

  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  assert.equal(game.pendingResponse.responder, 1);
  assert.equal(game.pendingResponse.passes, 1);
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;

  assert.equal(game.pendingResponse, null);
  assert.ok(game.players[0].grave.some((card) => card.id === "root"));
});

test("requesting the end of Main opens a response checkpoint before Combat", () => {
  const clean = state();
  clean.players[0].hand = [];
  let game = executeOnlineCommand(clean, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.phase, "principal");
  assert.equal(game.pendingResponse.responder, 1);
  assert.equal(game.priority.window, "main-end");
  assert.equal(game.pendingAction.type, "advancePhase");

  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.phase, "principal");
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  assert.equal(game.phase, "combate");
  assert.equal(game.pendingResponse, null);
});

test("grouped Online combat declares attackers, blockers and resolves left to right", () => {
  let game = combatState();
  game = executeOnlineCommand(game, { type: "declareAttackers", owner: 0, attackerIds: ["a-left", "a-right"] }).state;
  assert.equal(game.onlineCombat.stage, "after-attackers");
  assert.deepEqual(game.onlineCombat.attackers.map((entry) => entry.attackerId), ["a-left", "a-right"]);
  assert.equal(game.priority.window, "after-attackers");
  assert.equal(game.pendingResponse.responder, 1);

  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  assert.equal(game.onlineCombat.stage, "declare-blockers");
  assert.equal(game.priority.owner, 1);

  const leftAttack = game.onlineCombat.attackers.find((entry) => entry.attackerId === "a-left");
  game = executeOnlineCommand(game, {
    type: "declareBlockers",
    owner: 1,
    assignments: [{ attackId: leftAttack.attackId, defenderId: "blocker" }],
  }).state;
  assert.equal(game.onlineCombat.stage, "after-blockers");
  assert.equal(game.pendingResponse.responder, 0);
  assert.equal(game.priority.window, "after-blockers");

  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;

  assert.equal(game.onlineCombat.stage, "combat-end");
  assert.equal(game.onlineCombat.resolutionIndex, 2);
  assert.ok(game.players[1].grave.some((card) => card.id === "blocker"), "left lane resolves first and destroys its blocker");
  assert.equal(game.players[1].life, 27, "unblocked right lane deals direct damage after the left lane");
  assert.equal(game.pendingResponse.responder, 0, "active player receives the combat-end response window first");

  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.onlineCombat.stage, "complete");
  assert.equal(game.pendingResponse, null);
});

test("a normal defender cannot be assigned beyond Defensor capacity", () => {
  let game = combatState();
  game = executeOnlineCommand(game, { type: "declareAttackers", owner: 0, attackerIds: ["a-left", "a-right"] }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  const [first, second] = game.onlineCombat.attackers;
  assert.throws(() => executeOnlineCommand(game, {
    type: "declareBlockers",
    owner: 1,
    assignments: [
      { attackId: first.attackId, defenderId: "blocker" },
      { attackId: second.attackId, defenderId: "blocker" },
    ],
  }), /defender-capacity-exceeded/);
});

test("Indomável cannot be omitted from the grouped attack declaration", () => {
  const game = combatState();
  game.players[0].board = [unit("must-attack", 0, 2, 2, ["Indomável"])];
  assert.throws(() => executeOnlineCommand(game, { type: "declareAttackers", owner: 0, attackerIds: [] }), /indomitable-must-attack/);
});

test("a response from the wrong player is rejected by the server kernel", () => {
  const opened = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  assert.throws(() => executeOnlineCommand(opened, { type: "passPriority", owner: 0 }), /not-your-priority/);
});

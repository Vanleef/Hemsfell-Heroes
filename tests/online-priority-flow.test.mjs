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

test("normal Online action hands response priority to the opponent", () => {
  const opened = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  assert.equal(opened.phase, "principal");
  assert.equal(opened.pendingResponse.responder, 1);
  assert.equal(opened.priority.mode, "response");
  assert.equal(opened.priority.owner, 1);
  assert.equal(opened.priority.consecutivePasses, 0);
  assert.equal(onlinePriorityView(opened).stack.length, 1);
});

test("original actor may respond after opponent passes once", () => {
  let game = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.pendingResponse.responder, 0);
  assert.equal(game.pendingResponse.passes, 1);
  assert.ok(legalPriorityResponses(game, 0).some((command) => command.cardId === "actor-fast"));

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

test("a response from the wrong player is rejected by the server kernel", () => {
  const opened = executeOnlineCommand(state(), { type: "playCard", owner: 0, cardId: "root" }).state;
  assert.throws(() => executeOnlineCommand(opened, { type: "passPriority", owner: 0 }), /not-your-priority/);
});

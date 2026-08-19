import assert from "node:assert/strict";
import test from "node:test";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";

const player = (heroId = "saymon") => ({
  heroId,
  level: 3,
  heroXP: 0,
  levelUpsThisTurn: 0,
  life: 20,
  maxLife: 30,
  energy: 3,
  maxEnergy: 3,
  reserve: 3,
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
  cardsPlayed: 0,
  turnCardsPlayed: 0,
  turnSpellsPlayed: 0,
  spellsPlayed: 0,
  coffeeSpells: 0,
  damageDealt: 0,
  turnDeaths: 0,
});

const stateWithRootPriority = () => ({
  active: 0,
  phase: "combate",
  round: 4,
  winner: null,
  events: 0,
  log: [],
  pendingAction: { type: "attack", owner: 0, attackerId: "root-attacker" },
  pendingResponse: { responder: 1, actor: 0, action: "ataque", passes: 0 },
  players: [player(), player()],
});

test("online hero target choice suspends the response window and resumes it only after the target is chosen", () => {
  let state = stateWithRootPriority();

  state = executeOnlineCommand(state, { type: "activateHero", owner: 1, abilityId: "saymon-level-1" }, { priority: true }).state;
  assert.equal(state.pendingResponse?.responder, 0);
  assert.equal(state.priorityStack?.length, 2);

  state = executeOnlineCommand(state, { type: "passPriority", owner: 0 }, { priority: true }).state;
  assert.equal(state.pendingResponse?.responder, 1);
  assert.equal(state.pendingResponse?.passes, 1);

  state = executeOnlineCommand(state, { type: "passPriority", owner: 1 }, { priority: true }).state;
  assert.equal(state.pendingDecision?.kind, "activation-targets");
  assert.equal(state.pendingDecision?.owner, 1);
  assert.equal(state.pendingResponse, null);
  assert.equal(state.pendingAction, undefined);
  assert.equal(state.priorityStack, undefined);
  assert.ok(state.pendingDecision?.onlinePriorityResume);

  state = executeOnlineCommand(state, { type: "resolveDecision", owner: 1, targetIds: ["enemy-hero"] }, { priority: true }).state;
  assert.equal(state.pendingDecision, null);
  assert.equal(state.players[1].life, 18);
  assert.equal(state.players[0].life, 19);
  assert.equal(state.pendingResponse?.actor, 0);
  assert.equal(state.pendingResponse?.responder, 1);
  assert.equal(state.pendingResponse?.passes, 0);
  assert.equal(state.pendingAction?.type, "attack");
});

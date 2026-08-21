import assert from "node:assert/strict";
import test from "node:test";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";
import { orientOnlineGameForRole } from "../app/online-state-orientation.mjs";

const unit = (id, slot, atk = 2, hp = 3) => ({ uid: id, id, name: id, type: "Criatura", slot, atk, hp, text: "", tags: [], abilities: [], modifiers: [], damage: 0, exhausted: false, summoning: false, stunned: false, immobilized: false, suffocated: false, defenseUses: 0, attackLimit: 1, attacksThisTurn: 0, attackedThisTurn: false, markers: 0 });
const player = (heroId) => ({ heroId, level: 1, life: 30, maxLife: 30, energy: 2, maxEnergy: 3, reserve: 0, hand: [], deck: [], extraDeck: [], grave: [], obscuro: [], board: [], support: [], terrain: null, abilityUses: {}, markers: {}, heroXP: 0, levelUpsThisTurn: 0, cardsPlayed: 0, turnCardsPlayed: 0, turnSpellsPlayed: 0, spellsPlayed: 0, coffeeSpells: 0, damageDealt: 0, turnDeaths: 0, pendingTranqueira: false, nextCardDiscount: 0, nextNonCreatureDiscount: 0, nextSpellDiscount: 0, nextSummonPaysLife: false, nextCreaturePaysLife: false, catsEnteredThisTurn: 0 });
const initial = () => {
  const players = [player("saymon"), player("gimble")];
  players[0].board = [unit("attacker", 0, 2, 3)];
  players[1].board = [unit("blocker", 0, 1, 3)];
  return { active: 0, phase: "principal", round: 3, events: 0, winner: null, players };
};
const guest = (game) => orientOnlineGameForRole(game, "guest");
const passTwice = (game, first, second) => {
  game = executeOnlineCommand(game, { type: "passPriority", owner: first }).state;
  if (!game.pendingResponse) return game;
  return executeOnlineCommand(game, { type: "passPriority", owner: second }).state;
};

test("host and guest keep consistent ownership through one complete unitary attack", () => {
  let game = initial();

  game = executeOnlineCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.pendingResponse.responder, 1);
  assert.equal(game.pendingResponse.passes, 1);
  assert.equal(guest(game).pendingResponse.responder, 0);
  assert.equal(guest(game).priority.owner, 0);

  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.phase, "combate");
  assert.equal(game.pendingResponse, null);
  assert.equal(game.priority.interactionState, "combat-idle");
  assert.equal(game.active, 0);
  assert.equal(guest(game).active, 1);
  assert.equal(guest(game).priority.owner, 1);

  game = executeOnlineCommand(game, { type: "declareAttack", owner: 0, attackerId: "attacker" }).state;
  assert.equal(game.combatAction.attackerOwner, 0);
  assert.equal(game.combatAction.stage, "choosing");
  assert.equal(game.pendingResponse, null);
  assert.equal(game.priority.owner, 1);
  assert.equal(guest(game).combatAction.attackerOwner, 1);
  assert.equal(guest(game).priority.owner, 0, "guest locally owns the blocker decision");

  game = executeOnlineCommand(game, { type: "selectDefender", owner: 1, attackerId: "attacker", defenderId: "blocker", targetHero: false }).state;
  assert.equal(game.combatAction.stage, "priority");
  assert.equal(game.combatAction.defenderUid, "blocker");
  assert.equal(game.pendingResponse.responder, 0);
  assert.equal(game.priority.window, "after-blockers");
  assert.equal(guest(game).combatAction.defenderUid, "blocker");
  assert.equal(guest(game).pendingResponse.responder, 1);

  game = passTwice(game, 0, 1);
  assert.equal(game.combatAction, null);
  assert.equal(game.players[0].board[0].damage, 1);
  assert.equal(game.players[1].board[0].damage, 2);
  assert.equal(guest(game).players[0].board[0].uid, "blocker");
  assert.equal(guest(game).players[1].board[0].uid, "attacker");
  assert.equal(game.priority.interactionState, "combat-idle");
});

test("ending unitary combat enters Finalization directly and keeps orientation consistent", () => {
  let game = initial();
  game.phase = "combate";
  game.players[0].board = [];
  game.players[1].board = [];
  game = executeOnlineCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.phase, "fim");
  assert.equal(game.pendingResponse.responder, 0);
  assert.equal(game.priority.interactionState, "finalization-response");
  assert.equal(guest(game).pendingResponse.responder, 1);
  assert.equal(guest(game).priority.owner, 1);
  game = passTwice(game, 0, 1);
  assert.equal(game.phase, "manutencao");
  assert.equal(game.active, 1);
  assert.equal(guest(game).active, 0);
});
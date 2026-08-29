import assert from "node:assert/strict";
import test from "node:test";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";
import { orientOnlineGameForRole } from "../app/application/session/online-state-orientation.mjs";

const drawCard = (id) => ({ id, uid: id, name: id, type: "Criatura", cost: 1, atk: 1, hp: 1, text: "", tags: [], subtypes: [], abilities: [], modifiers: [] });
const unit = (id, slot, atk = 2, hp = 3) => ({ uid: id, id, name: id, type: "Criatura", slot, atk, hp, text: "", tags: [], abilities: [], modifiers: [], damage: 0, exhausted: false, summoning: false, stunned: false, frozen: false, immobilized: false, suffocated: false, defenseUses: 0, attackLimit: 1, attacksThisTurn: 0, attackedThisTurn: false, markers: 0 });
const player = (heroId, prefix) => ({
  heroId, level: 1, life: 30, maxLife: 30,
  energy: 0, maxEnergy: 2, reserve: 0,
  hand: [], deck: [drawCard(`${prefix}-1`), drawCard(`${prefix}-2`), drawCard(`${prefix}-3`)], extraDeck: [], grave: [], obscuro: [],
  board: [], support: [], terrain: null, abilityUses: {}, markers: {}, heroXP: 0, levelUpsThisTurn: 0,
  cardsPlayed: 0, turnCardsPlayed: 0, turnSpellsPlayed: 0, spellsPlayed: 0, coffeeSpells: 0, damageDealt: 0, turnDeaths: 0,
  nextCardDiscounts: [], nextCardDiscount: 0, nextNonCreatureDiscount: 0, nextSpellDiscount: 0, nextCreaturePaysLife: false,
});
const initial = () => {
  const players = [player("saymon", "host"), player("gimble", "guest")];
  players[0].board = [unit("host-attacker", 0, 2, 3)];
  return { active: 0, phase: "manutencao", round: 2, events: 0, winner: null, players };
};
const passTwice = (game, first, second) => {
  game = executeOnlineCommand(game, { type: "passPriority", owner: first }).state;
  if (!game.pendingResponse) return game;
  return executeOnlineCommand(game, { type: "passPriority", owner: second }).state;
};

test("one Online v3 turn crosses Maintenance, Main, unitary Combat, Finalization and hands off cleanly", () => {
  let game = initial();

  game = executeOnlineCommand(game, { type: "maintenanceChoice", owner: 0, drawTwo: false }).state;
  assert.equal(game.phase, "principal");
  assert.equal(game.players[0].maxEnergy, 3);
  assert.equal(game.players[0].energy, 3);
  assert.equal(game.priority.interactionState, "action-priority");
  assert.equal(game.priority.owner, 0);

  game = executeOnlineCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.phase, "principal");
  assert.equal(game.priority.window, "main-end");
  assert.equal(game.pendingResponse.responder, 1);
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.phase, "combate");
  assert.equal(game.priority.interactionState, "combat-idle");

  /* There is no defending creature, so declareAttack jumps directly to the
     post-block response checkpoint instead of creating an empty blocker choice. */
  game = executeOnlineCommand(game, { type: "declareAttack", owner: 0, attackerId: "host-attacker" }).state;
  assert.equal(game.priority.interactionState, "response-priority");
  assert.equal(game.priority.window, "after-blockers");
  assert.equal(game.combatAction.targetHero, true);
  assert.equal(game.pendingResponse.responder, 0);
  game = passTwice(game, 0, 1);
  assert.equal(game.combatAction, null);
  assert.equal(game.players[1].life, 28);
  assert.equal(game.priority.interactionState, "combat-idle");

  game = executeOnlineCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.phase, "fim");
  assert.equal(game.players[0].energy, 0);
  assert.equal(game.players[0].reserve, 3);
  assert.equal(game.priority.interactionState, "finalization-response");
  assert.equal(game.priority.owner, 0);
  game = passTwice(game, 0, 1);

  assert.equal(game.phase, "manutencao");
  assert.equal(game.active, 1);
  assert.equal(game.priority.interactionState, "maintenance-decision");
  assert.equal(game.priority.owner, 1);

  const guest = orientOnlineGameForRole(game, "guest");
  assert.equal(guest.active, 0);
  assert.equal(guest.priority.owner, 0);
  assert.equal(guest.priority.interactionState, "maintenance-decision");

  game = executeOnlineCommand(game, { type: "maintenanceChoice", owner: 1, drawTwo: false }).state;
  assert.equal(game.phase, "principal");
  assert.equal(game.active, 1);
  assert.equal(game.priority.interactionState, "action-priority");
  assert.equal(game.priority.owner, 1);
});
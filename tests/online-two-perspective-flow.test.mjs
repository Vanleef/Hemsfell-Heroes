import assert from "node:assert/strict";
import test from "node:test";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";
import { orientOnlineGameForRole } from "../app/online-state-orientation.mjs";

const unit = (id, slot, atk = 2, hp = 3) => ({
  uid: id,
  id,
  name: id,
  type: "Criatura",
  slot,
  atk,
  hp,
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

const player = (heroId) => ({
  heroId,
  level: 1,
  life: 30,
  maxLife: 30,
  energy: 2,
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
  levelUpsThisTurn: 0,
  cardsPlayed: 0,
  turnCardsPlayed: 0,
  turnSpellsPlayed: 0,
  spellsPlayed: 0,
  coffeeSpells: 0,
  damageDealt: 0,
  turnDeaths: 0,
  pendingTranqueira: false,
  nextCardDiscount: 0,
  nextNonCreatureDiscount: 0,
  nextSpellDiscount: 0,
  nextSummonPaysLife: false,
  nextCreaturePaysLife: false,
  catsEnteredThisTurn: 0,
});

const initial = () => {
  const players = [player("saymon"), player("gimble")];
  players[0].board = [unit("attacker", 0, 2, 3)];
  players[1].board = [unit("blocker", 0, 1, 3)];
  return {
    active: 0,
    phase: "principal",
    round: 3,
    events: 0,
    winner: null,
    players,
  };
};

const guest = (game) => orientOnlineGameForRole(game, "guest");

test("host and guest see one consistent priority owner through the full grouped combat", () => {
  let game = initial();

  // Host asks to leave Main. Guest owns the first Main-end response.
  game = executeOnlineCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(game.pendingResponse.responder, 1);
  assert.equal(guest(game).pendingResponse.responder, 0);
  assert.equal(guest(game).priority.owner, 0);

  // Guest passes, then host passes: Combat begins and active host owns combat-start priority.
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.pendingResponse.responder, 0);
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  assert.equal(game.phase, "combate");
  assert.equal(game.priority.window, "combat-start");
  assert.equal(game.pendingResponse.responder, 0);

  // Combat-start itself uses the same two-pass protocol.
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  assert.equal(guest(game).pendingResponse.responder, 0);
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.onlineCombat.stage, "declare-attackers");
  assert.equal(game.priority.owner, 0);
  assert.deepEqual(game.onlineCombat.interaction.attackerOptions.map((entry) => entry.attackerId), ["attacker"]);

  // Host commits the group. Guest sees itself as response owner.
  game = executeOnlineCommand(game, { type: "declareAttackers", owner: 0, attackerIds: ["attacker"] }).state;
  assert.equal(game.onlineCombat.stage, "after-attackers");
  assert.equal(game.pendingResponse.responder, 1);
  assert.equal(guest(game).priority.owner, 0);

  // After both passes, blocker declaration belongs to the guest and its
  // authoritative interaction ids survive orientation unchanged.
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  assert.equal(game.onlineCombat.stage, "declare-blockers");
  assert.equal(game.onlineCombat.interaction.owner, 1);
  const guestBlockView = guest(game);
  assert.equal(guestBlockView.onlineCombat.attackerOwner, 1);
  assert.equal(guestBlockView.onlineCombat.interaction.owner, 0);
  assert.deepEqual(guestBlockView.onlineCombat.interaction.blockerOptions[0].defenderIds, ["blocker"]);

  const attackId = game.onlineCombat.attackers[0].attackId;
  game = executeOnlineCommand(game, {
    type: "declareBlockers",
    owner: 1,
    assignments: [{ attackId, defenderId: "blocker" }],
  }).state;
  assert.equal(game.onlineCombat.stage, "after-blockers");
  assert.equal(game.pendingResponse.responder, 0);
  assert.equal(game.onlineCombat.interaction, undefined);

  // Host then guest pass the final pre-damage window. Combat resolves and
  // returns priority to the active host at combat-end.
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.onlineCombat.stage, "combat-end");
  assert.equal(game.pendingResponse.responder, 0);
  assert.equal(game.players[0].board[0].damage, 1);
  assert.equal(game.players[1].board[0].damage, 2);

  // Combat-end passes enter Finalization, bank main Energy, and expose the
  // final response checkpoint without changing which side each client is.
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.phase, "fim");
  assert.equal(game.players[0].energy, 0);
  assert.equal(game.players[0].reserve, 2);
  assert.equal(game.pendingResponse.responder, 0);
  assert.equal(guest(game).pendingResponse.responder, 1);

  // Final two passes hand the turn to the former guest.
  game = executeOnlineCommand(game, { type: "passPriority", owner: 0 }).state;
  game = executeOnlineCommand(game, { type: "passPriority", owner: 1 }).state;
  assert.equal(game.phase, "manutencao");
  assert.equal(game.active, 1);
  assert.equal(guest(game).active, 0);
});

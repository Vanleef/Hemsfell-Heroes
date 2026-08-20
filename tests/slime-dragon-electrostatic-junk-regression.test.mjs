import assert from "node:assert/strict";
import test from "node:test";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const state = () => ({
  active: 0,
  phase: "principal",
  round: 1,
  players: [0, 1].map(() => ({
    life: 30,
    maxLife: 30,
    energy: 5,
    maxEnergy: 5,
    reserve: 0,
    deck: [],
    hand: [],
    board: [],
    support: [],
    terrain: null,
    grave: [],
    obscuro: [],
  })),
});

const creature = (uid, atk = 1, hp = 5) => ({
  uid,
  id: uid,
  type: "Criatura",
  atk,
  hp,
  damage: 0,
  tags: [],
  abilities: [],
  modifiers: [],
  exhausted: false,
  summoning: false,
});

test("Dragão de Limo restores its authoritative Last Breath and deals 2 to every creature in play", () => {
  const game = state();
  game.active = 1;
  game.phase = "combate";

  game.players[0].board.push(
    { ...creature("slime", 0, 1), id: "p10", page: 10, name: "Dragão de Limo" },
    creature("slime-ally"),
  );
  game.players[1].board.push(creature("attacker", 1), creature("attacker-ally"));

  const result = executeCommand(game, { type: "attack", owner: 1, attackerId: "attacker", defenderId: "slime" }).state;

  assert.equal(result.players[0].board.some((card) => card.uid === "slime"), false);
  assert.equal(result.players[0].grave.some((card) => card.uid === "slime"), true);
  assert.equal(result.players[0].board.find((card) => card.uid === "slime-ally")?.damage, 2);
  assert.equal(result.players[1].board.find((card) => card.uid === "attacker")?.damage, 2);
  assert.equal(result.players[1].board.find((card) => card.uid === "attacker-ally")?.damage, 2);
});

test("Tranqueira-Mática Eletrostática restores its authoritative turn-end trigger and leaves on its controller turn", () => {
  const game = state();
  game.phase = "combate";
  game.players[0].support.push({
    uid: "electrostatic-junk",
    id: "p46",
    page: 46,
    name: "TRANQUEIRA-MÁTICA ELETROSTÁTICA",
    type: "Feitiço",
    slot: 0,
    enteredRound: 1,
    remainUntilTurnEnd: true,
    cardsPlayedAfterSelf: 2,
    abilities: [],
  });

  const result = executeCommand(game, { type: "advancePhase", owner: 0 }).state;

  assert.equal(result.phase, "fim");
  assert.equal(result.players[0].support.some((card) => card.uid === "electrostatic-junk"), false);
  assert.equal(result.players[0].grave.some((card) => card.uid === "electrostatic-junk"), true);
  assert.equal(result.players[0].life, 28);
});

test("Tranqueira-Mática Eletrostática does not expire on the opponent turn", () => {
  const game = state();
  game.active = 1;
  game.phase = "combate";
  game.players[0].support.push({
    uid: "electrostatic-junk",
    id: "p46",
    page: 46,
    name: "TRANQUEIRA-MÁTICA ELETROSTÁTICA",
    type: "Feitiço",
    slot: 0,
    enteredRound: 1,
    remainUntilTurnEnd: true,
    cardsPlayedAfterSelf: 2,
    abilities: [],
  });

  const result = executeCommand(game, { type: "advancePhase", owner: 1 }).state;

  assert.equal(result.phase, "fim");
  assert.equal(result.players[0].support.some((card) => card.uid === "electrostatic-junk"), true);
  assert.equal(result.players[0].life, 30);
});

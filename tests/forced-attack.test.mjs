import assert from "node:assert/strict";
import test from "node:test";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const player = () => ({
  heroId: "gimble",
  level: 1,
  heroXP: 0,
  levelUpsThisTurn: 0,
  life: 30,
  maxLife: 30,
  maxEnergy: 10,
  energy: 10,
  reserve: 0,
  deck: [],
  extraDeck: [],
  hand: [],
  board: [],
  support: [],
  terrain: null,
  grave: [],
  obscuro: [],
  cardsPlayed: 0,
  turnCardsPlayed: 0,
  turnSpellsPlayed: 0,
  spellsPlayed: 0,
  abilityUses: {},
});

const unit = ({ uid, name, atk, hp, tags = [], exhausted = false }) => ({
  id: uid,
  uid,
  page: 999,
  name,
  type: "Criatura",
  cost: 1,
  atk,
  hp,
  text: "",
  tags,
  subtypes: tags,
  abilities: [],
  slot: 0,
  enteredRound: 0,
  damage: 0,
  exhausted,
  summoning: false,
  stunned: false,
  markers: 0,
  modifiers: [],
  defenseUses: 0,
});

const state = () => ({
  active: 0,
  phase: "principal",
  round: 2,
  players: [player(), player()],
  cardCatalog: [],
  log: [],
  selectedAttackers: [],
  events: 0,
  winner: null,
  pendingDecision: {
    kind: "forced-attack",
    owner: 0,
    effect: { attacker: { controller: "self", subtype: "Dragão", ready: true }, defender: "anyCreature" },
    context: { owner: 0, sourceId: "p17-spell" },
  },
});

test("forced Dragon combat resolves once without opening another combat flow", () => {
  const game = state();
  game.players[0].board.push(unit({ uid: "dragon", name: "Dragão", atk: 3, hp: 5, tags: ["Dragão"] }));
  game.players[1].board.push(unit({ uid: "enemy", name: "Inimigo", atk: 2, hp: 5 }));

  const result = executeCommand(game, { type: "resolveDecision", owner: 0, attackerId: "dragon", defenderId: "enemy" }).state;
  const dragon = result.players[0].board.find((card) => card.uid === "dragon");
  const enemy = result.players[1].board.find((card) => card.uid === "enemy");

  assert.equal(result.pendingDecision ?? null, null);
  assert.equal(result.combatAction ?? null, null);
  assert.equal(dragon.damage, 2);
  assert.equal(enemy.damage, 3);
  assert.equal(dragon.exhausted, true);
  assert.equal(dragon.attacksThisTurn, 1);
});

test("forced Dragon combat rejects a turned Dragon", () => {
  const game = state();
  game.players[0].board.push(unit({ uid: "dragon", name: "Dragão", atk: 3, hp: 5, tags: ["Dragão"], exhausted: true }));
  game.players[1].board.push(unit({ uid: "enemy", name: "Inimigo", atk: 2, hp: 5 }));

  assert.throws(
    () => executeCommand(game, { type: "resolveDecision", owner: 0, attackerId: "dragon", defenderId: "enemy" }),
    /invalid-forced-attack/,
  );
});


test("Investida Alada allows a ready Image Dragon to attack immediately", () => {
  const game = state();
  const imageDragon = unit({ uid: "image-dragon", name: "Dragão Filhote", atk: 2, hp: 1, tags: ["Dragão"] });
  imageDragon.page = 23; imageDragon.imageCard = true; imageDragon.generatedImage = true; imageDragon.summoning = true;
  game.players[0].board.push(imageDragon);
  game.players[1].board.push(unit({ uid: "enemy", name: "Inimigo", atk: 1, hp: 4 }));
  game.pendingDecision.effect.attacker.allowSummoning = true;
  game.pendingDecision.effect.defender = "enemyCreature";
  const result = executeCommand(game, { type: "resolveDecision", owner: 0, attackerId: "image-dragon", defenderId: "enemy" }).state;
  const enemy = result.players[1].board.find((card) => card.uid === "enemy");
  assert.equal(enemy.damage, 2);
  assert.equal(result.pendingDecision ?? null, null);
});

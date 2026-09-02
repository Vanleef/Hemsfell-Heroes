import test from "node:test";
import assert from "node:assert/strict";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const terrain = (id = "terrain-drop") => ({
  id,
  name: "Terreno Cruel de Teste",
  type: "Terreno",
  cost: 1,
  text: "",
  tags: [],
  subtypes: [],
  abilities: [],
});

const player = () => ({
  heroId: "gimble",
  level: 1,
  life: 30,
  maxLife: 30,
  energy: 3,
  maxEnergy: 3,
  reserve: 0,
  hand: [],
  deck: [],
  extraDeck: [],
  board: [],
  support: [],
  terrain: null,
  grave: [],
  obscuro: [],
  abilityUses: {},
  nextElementEffects: [],
  turnCardsPlayed: 0,
  turnSpellsPlayed: 0,
  spellsPlayed: 0,
});

const state = () => ({
  active: 0,
  phase: "principal",
  round: 1,
  players: [player(), player()],
});

test("playing a Terrain removes it from hand and occupies the Cruel Terrain zone", () => {
  const game = state();
  const card = terrain();
  game.players[0].hand.push(card);

  const result = executeCommand(game, {
    type: "playCard",
    owner: 0,
    cardId: card.id,
    slot: 0,
    skipPriority: true,
  }).state;

  assert.equal(result.players[0].hand.some((entry) => entry.id === card.id), false);
  assert.equal(result.players[0].terrain?.id, card.id);
  assert.equal(result.players[0].terrain?.slot, 0);
});

test("playing a new Terrain replaces the old terrain without losing the new card", () => {
  const game = state();
  const oldTerrain = { ...terrain("terrain-old"), uid: "terrain-old-live", slot: 0 };
  const nextTerrain = terrain("terrain-next");
  game.players[0].terrain = oldTerrain;
  game.players[0].hand.push(nextTerrain);

  const result = executeCommand(game, {
    type: "playCard",
    owner: 0,
    cardId: nextTerrain.id,
    slot: 0,
    skipPriority: true,
  }).state;

  assert.equal(result.players[0].terrain?.id, nextTerrain.id);
  assert.ok(result.players[0].grave.some((entry) => entry.id === oldTerrain.id));
  assert.equal(result.players[0].hand.some((entry) => entry.id === nextTerrain.id), false);
});

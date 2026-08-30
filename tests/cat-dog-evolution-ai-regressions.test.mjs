import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import cards from "../app/data/catalog/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { buildAIActionCandidates } from "../app/rules-engine/ai.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { hasSubtype, subtypesFor } from "../app/rules-engine/subtypes.mjs";

const printed = (page, overrides = {}) => ({ ...compileCard(cards.find((card) => card.page === page)), ...overrides });
const player = (heroId = "rasmus") => ({
  heroId, level: 1, heroXP: 0, levelUpsThisTurn: 0, markers: {}, abilityUses: {},
  life: 30, maxLife: 30, energy: 10, maxEnergy: 10, reserve: 0,
  deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [],
  turnCardsPlayed: 0, turnSpellsPlayed: 0, spellsPlayed: 0, turnDeaths: 0,
});
const state = () => ({ active: 0, phase: "principal", round: 1, players: [player(), player("gimble")] });
const unit = (card, uid, slot = 0, overrides = {}) => ({
  ...card, uid, slot, enteredRound: 0, damage: 0, exhausted: false, summoning: false,
  attackedThisTurn: false, attacksThisTurn: 0, defenseUses: 0, modifiers: [], markers: 0, ...overrides,
});

test("Gato and Cachorro are real creature subtypes, including creature Images", () => {
  const multidimensional = printed(213);
  const catDog = printed(245);
  assert.equal(hasSubtype(multidimensional, "Gato"), true);
  assert.deepEqual(new Set(subtypesFor(catDog)), new Set(["Gato", "Cachorro"]));
  assert.equal(hasSubtype({ type: "Criatura", name: "Gato Astral", page: 999, imageCard: true }, "Gato"), true);
  assert.equal(hasSubtype({ type: "Criatura", name: "Cachorro Astral", page: 1000, imageCard: true }, "Cachorro"), true);
  assert.equal(hasSubtype({ type: "Feitiço", name: "Rebelião dos Gatos", page: 1001 }, "Gato"), false);
});

test("Morris attack tracks the live number of Cats in play, including Images", () => {
  let game = state();
  game.players[0].board = [unit(printed(213), "image-cat", 0, { generatedImage: true, imageCard: true })];
  game.players[0].hand = [{ ...printed(214), id: "morris-hand", cost: 0 }];
  game = executeCommand(game, { type: "playCard", owner: 0, cardId: "morris-hand", slot: 1, skipPriority: true }).state;
  const morris = game.players[0].board.find((card) => card.page === 214);
  assert.ok(morris?.dynamicStats?.subtypeCountAcrossFields === "Gato");
  morris.summoning = false;
  game.phase = "combate";
  game = executeCommand(game, { type: "attack", owner: 0, attackerId: morris.uid }).state;
  assert.equal(game.players[1].life, 28, "Morris and the Gato Multidimensional are two Cats in play");
});

test("O Gato Cachorro adds Cat count to printed attack and Dog count to printed health", () => {
  let game = state();
  game.players[0].board = [unit(printed(213), "image-cat", 0, { generatedImage: true, imageCard: true })];
  game.players[1].board = [unit({ id: "dog", name: "Cachorro Guardião", type: "Criatura", cost: 0, atk: 2, hp: 4, text: "", tags: [], subtypes: ["Cachorro"], abilities: [] }, "dog", 0)];
  game.players[0].hand = [{ ...printed(245), id: "cat-dog-hand", cost: 0 }];
  game = executeCommand(game, { type: "playCard", owner: 0, cardId: "cat-dog-hand", slot: 1, skipPriority: true }).state;
  const catDog = game.players[0].board.find((card) => card.page === 245);
  assert.ok(catDog?.dynamicStats?.attackSubtype === "Gato");
  assert.ok(catDog?.dynamicStats?.healthSubtype === "Cachorro");
  catDog.summoning = false;
  game.phase = "combate";
  game = executeCommand(game, { type: "attack", owner: 0, attackerId: catDog.uid, defenderId: "dog" }).state;
  const liveCatDog = game.players[0].board.find((card) => card.page === 245);
  const liveDog = game.players[1].board.find((card) => card.uid === "dog");
  assert.ok(liveCatDog, "1/1 + two Dogs must survive 2 damage as a 3-health creature");
  assert.ok(liveDog, "the 4-health Dog survives the 3 attack");
  assert.equal(liveCatDog.damage, 2);
  assert.equal(liveDog.damage, 3, "1 printed attack + two Cats in play = 3 attack");
});

test("dynamic Dog health is rechecked when a Dog leaves play", () => {
  let game = state();
  const guard = unit({ id: "dog", name: "Cachorro Frágil", type: "Criatura", cost: 0, atk: 2, hp: 1, text: "", tags: [], subtypes: ["Cachorro"], abilities: [] }, "dog", 0);
  game.players[1].board = [guard];
  game.players[0].hand = [{ ...printed(245), id: "cat-dog-hand", cost: 0 }];
  game = executeCommand(game, { type: "playCard", owner: 0, cardId: "cat-dog-hand", slot: 0, skipPriority: true }).state;
  const catDog = game.players[0].board.find((card) => card.page === 245);
  catDog.summoning = false;
  game.phase = "combate";
  game = executeCommand(game, { type: "attack", owner: 0, attackerId: catDog.uid, defenderId: "dog" }).state;
  assert.equal(game.players[1].board.some((card) => card.uid === "dog"), false, "the fragile Dog dies first");
  assert.equal(game.players[0].board.some((card) => card.page === 245), false, "after Dog count drops, 2 damage becomes lethal to Gato Cachorro");
});

test("hero evolution is an authoritative AI candidate instead of a page-level automatic action", () => {
  const game = state();
  game.active = 1;
  game.players[1] = { ...player("goblin"), energy: 2, reserve: 0, turnCardsPlayed: 3 };
  assert.ok(buildAIActionCandidates(game, 1, "Normal").some((command) => command.type === "evolveHero"));
  const evolved = executeCommand(game, { type: "evolveHero", owner: 1 }).state;
  assert.equal(evolved.players[1].level, 2);
  assert.equal(evolved.players[1].energy, 0);
  assert.equal(evolved.players[1].levelUpsThisTurn, 1);
  assert.throws(() => executeCommand(evolved, { type: "evolveHero", owner: 1 }), /hero-evolution-unavailable/);

  const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /const evolutionTargets=levelTargets\(game\.players\[1\]\)/);
  assert.match(page, /runRulesCommand\(\{type:"evolveHero"\},0\)/);
});

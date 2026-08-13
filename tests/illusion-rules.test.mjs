import assert from "node:assert/strict";
import test from "node:test";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const baseState = () => ({
  active: 0,
  phase: "principal",
  round: 1,
  players: [0, 1].map(() => ({
    heroId: "gimble", level: 1, life: 30, maxLife: 30,
    energy: 10, maxEnergy: 10, reserve: 0,
    deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null,
    grave: [], obscuro: [], cardsPlayed: 0, turnCardsPlayed: 0,
    turnSpellsPlayed: 0, spellsPlayed: 0, abilityUses: {},
  })),
});

const spell = (page, name, cost) => compileCard({ id: `p${page}`, page, name, type: "Feitiço", cost, text: "", tags: [] });
const image = (page, name, slot, uid = `image-${page}-${slot}`) => ({
  id: `p${page}`, uid, page, name, type: "Criatura", cost: 0,
  atk: page === 23 ? 2 : page === 24 ? 4 : 6,
  hp: page === 23 ? 1 : page === 24 ? 2 : 3,
  tags: [], abilities: [], imageCard: true, generatedImage: true,
  slot, damage: 0, exhausted: false, summoning: false, modifiers: [],
});
const extra = (page, name) => ({ id: `p${page}`, page, name, type: "Criatura", cost: 0, atk: page === 24 ? 4 : 6, hp: page === 24 ? 2 : 3, tags: [], abilities: [], imageCard: true });

test("Ilusão Dracônica without Dragão Filhote costs four and creates Dragão Jovem without a target", () => {
  const game = baseState();
  game.players[0].energy = 4;
  game.players[0].hand.push(spell(13, "Ilusão Dracônica", 4));
  game.players[0].extraDeck.push(extra(24, "Dragão Jovem"));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p13", skipPriority: true }).state;
  assert.equal(result.players[0].energy, 0);
  assert.equal(result.pendingDecision ?? null, null);
  assert.equal(result.players[0].board.filter((card) => card.name === "Dragão Jovem").length, 1);
});

test("Ilusão Dracônica with one Dragão Filhote costs two and auto-replaces it", () => {
  const game = baseState();
  game.players[0].energy = 4;
  game.players[0].board.push(image(23, "Dragão Filhote", 3, "hatchling"));
  game.players[0].hand.push(spell(13, "Ilusão Dracônica", 4));
  game.players[0].extraDeck.push(extra(24, "Dragão Jovem"));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p13", skipPriority: true }).state;
  assert.equal(result.players[0].energy, 2);
  assert.equal(result.pendingDecision ?? null, null);
  assert.equal(result.players[0].board.some((card) => card.uid === "hatchling"), false);
  assert.equal(result.players[0].board.find((card) => card.name === "Dragão Jovem")?.slot, 3);
});

test("Ilusão Dracônica replaces exactly the chosen Dragão Filhote when several exist", () => {
  const game = baseState();
  game.players[0].energy = 4;
  game.players[0].board.push(image(23, "Dragão Filhote", 1, "first"), image(23, "Dragão Filhote", 4, "chosen"));
  game.players[0].hand.push(spell(13, "Ilusão Dracônica", 4));
  game.players[0].extraDeck.push(extra(24, "Dragão Jovem"));
  const pending = executeCommand(game, { type: "playCard", owner: 0, cardId: "p13", skipPriority: true }).state;
  assert.equal(pending.pendingDecision?.kind, "targets");
  assert.equal(pending.pendingDecision?.targetSteps?.[0]?.requiredName, "Dragão Filhote");
  const result = executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["chosen"] }).state;
  assert.equal(result.players[0].board.some((card) => card.uid === "first"), true);
  assert.equal(result.players[0].board.some((card) => card.uid === "chosen"), false);
  assert.equal(result.players[0].board.find((card) => card.name === "Dragão Jovem")?.slot, 4);
});

test("conditional Image decision rejects an unrelated allied creature when several valid Images require a choice", () => {
  const game = baseState();
  game.players[0].energy = 4;
  game.players[0].board.push(
    image(23, "Dragão Filhote", 0, "first"),
    image(23, "Dragão Filhote", 1, "second"),
    { uid: "other", name: "Outra Criatura", type: "Criatura", slot: 2, atk: 1, hp: 1, tags: [], abilities: [], exhausted: false, summoning: false, modifiers: [] },
  );
  game.players[0].hand.push(spell(13, "Ilusão Dracônica", 4));
  game.players[0].extraDeck.push(extra(24, "Dragão Jovem"));
  const pending = executeCommand(game, { type: "playCard", owner: 0, cardId: "p13", skipPriority: true }).state;
  assert.equal(pending.pendingDecision?.kind, "targets");
  assert.throws(() => executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["other"] }), /invalid-target/);
});

test("Ilusão Dracônica Maior auto-replaces a single Dragão Jovem", () => {
  const game = baseState();
  game.players[0].energy = 6;
  game.players[0].board.push(image(24, "Dragão Jovem", 2, "young"));
  game.players[0].hand.push(spell(14, "Ilusão Dracônica Maior", 6));
  game.players[0].extraDeck.push(extra(25, "Dragão Ancião"));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p14", skipPriority: true }).state;
  assert.equal(result.players[0].energy, 3);
  assert.equal(result.pendingDecision ?? null, null);
  assert.equal(result.players[0].board.some((card) => card.uid === "young"), false);
  assert.equal(result.players[0].board.find((card) => card.name === "Dragão Ancião")?.slot, 2);
});

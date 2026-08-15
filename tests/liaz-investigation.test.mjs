import assert from "node:assert/strict";
import test from "node:test";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { defaultEffectHandlers } from "../app/rules-engine/effects.mjs";

const baseState = () => ({
  active: 0,
  phase: "principal",
  round: 1,
  events: 0,
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
    abilityUses: {},
  })),
});

const liazUnit = () => {
  const card = compileCard({
    id: "p263",
    page: 263,
    name: "Liaz",
    type: "Criatura",
    cost: 4,
    atk: 3,
    hp: 4,
    text: "Durante um Investigar, ao Revelar: Criatura→ Cause 1 dano a uma criatura inimiga. Feitiço→ Essa carta ganha Barreira Magica. Artefato→ Essa carta ganha Furtivo. Os efeitos duram até o fim do turno.",
    tags: ["Furtivo"],
  });
  return { ...card, uid: "liaz", slot: 0, damage: 0, exhausted: false, summoning: false, modifiers: [], temporaryTags: [] };
};

const investigateTop = (game, card) => {
  game.players[0].deck = [card];
  defaultEffectHandlers.investigate(game, { amount: 1, target: "controllerDeck" }, { owner: 0, sourceId: "investigation-test" });
  return executeCommand(game, { type: "resolveDecision", owner: 0, selectedCardIds: [card.id] }).state;
};

test("Liaz does not enter with permanent Furtivo from conditional rules text", () => {
  const liaz = liazUnit();
  assert.equal(liaz.tags.includes("Furtivo"), false);
  assert.equal(liaz.temporaryTags.includes("Furtivo"), false);
});

test("Liaz only gains Furtivo after an Artefato is revealed by Investigar and loses it at turn end", () => {
  const game = baseState();
  game.players[0].board.push(liazUnit());
  let result = investigateTop(game, { id: "artifact", name: "Artefato revelado", type: "Artefato", cost: 1, tags: [], abilities: [] });
  assert.ok(result.players[0].board[0].temporaryTags.includes("Furtivo"));
  result.phase = "fim";
  result = executeCommand(result, { type: "advancePhase", owner: 0 }).state;
  assert.equal(result.players[0].board[0].temporaryTags.includes("Furtivo"), false);
});

test("Liaz only gains Barreira Mágica after a Feitiço is revealed by Investigar and loses it at turn end", () => {
  const game = baseState();
  game.players[0].board.push(liazUnit());
  let result = investigateTop(game, { id: "spell", name: "Feitiço revelado", type: "Feitiço", cost: 1, tags: [], abilities: [] });
  assert.ok(result.players[0].board[0].temporaryTags.includes("Barreira Mágica"));
  result.phase = "fim";
  result = executeCommand(result, { type: "advancePhase", owner: 0 }).state;
  assert.equal(result.players[0].board[0].temporaryTags.includes("Barreira Mágica"), false);
});

test("Liaz deals 1 only after a Criatura is revealed by Investigar", () => {
  const game = baseState();
  game.players[0].board.push(liazUnit());
  game.players[1].board.push({ uid: "enemy", id: "enemy", name: "Alvo", type: "Criatura", atk: 1, hp: 3, damage: 0, tags: [], abilities: [], modifiers: [], exhausted: false, summoning: false, slot: 0 });
  const pending = investigateTop(game, { id: "creature", name: "Criatura revelada", type: "Criatura", cost: 1, atk: 1, hp: 1, tags: [], abilities: [] });
  assert.equal(pending.pendingDecision?.kind, "targets");
  const resolved = executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["enemy"] }).state;
  assert.equal(resolved.players[1].board[0].damage, 1);
});

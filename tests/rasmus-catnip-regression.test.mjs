import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const cards = JSON.parse(fs.readFileSync(new URL("../app/cards.generated.json", import.meta.url), "utf8"));
const raw = (page) => cards.find((card) => Number(card.page) === page);
const player = () => ({ heroId: "rasmus", level: 1, heroXP: 0, levelUpsThisTurn: 0, life: 30, maxEnergy: 10, energy: 10, reserve: 0, deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [], cardsPlayed: 0, turnCardsPlayed: 0, turnSpellsPlayed: 0, spellsPlayed: 0, coffeeSpells: 0, damageDealt: 0, turnDeaths: 0, abilityUses: {}, pendingTranqueira: false, nextCardDiscount: 0, nextNonCreatureDiscount: 0, nextSpellDiscount: 0, nextSummonPaysLife: false, catsEnteredThisTurn: 0 });

test("Erva de Gato opens a deck search decision, never field targeting", () => {
  const p0 = player(), p1 = player();
  const herb = { ...compileCard(raw(222)), uid: "erva-1" };
  const cat = { ...compileCard(raw(214)), id: "cat-1", uid: "cat-1", name: "Gato Teste", subtypes: ["Gato"] };
  const nonCat = { ...compileCard(raw(3)), id: "other-1", uid: "other-1", name: "Outro", subtypes: ["Dragão"] };
  p0.hand = [herb];
  p0.deck = [cat, nonCat];
  const state = { players: [p0, p1], active: 0, phase: "principal", round: 1, log: [], winner: null, selectedAttackers: [], events: 0, priorityStack: [], pendingResponse: null, pendingDecision: null };
  const result = executeCommand(state, { type: "playCard", owner: 0, handIndex: 0, cardId: herb.id }, { priority: false });
  assert.equal(result.state.pendingDecision?.kind, "search");
  assert.equal(result.state.pendingDecision?.effect?.subtype, "Gato");
  assert.equal(result.state.pendingDecision?.effect?.destination, "hand");
  assert.equal(result.state.pendingDecision?.effect?.amount, 1);
  assert.equal(result.state.pendingDecision?.effect?.target, undefined);
  assert.deepEqual(result.state.pendingDecision?.targetSteps || [], []);
});

test("Erva de Gato search only accepts a Gato from the controller deck", () => {
  const p0 = player(), p1 = player();
  const herb = { ...compileCard(raw(222)), uid: "erva-2" };
  const cat = { ...compileCard(raw(214)), id: "cat-2", uid: "cat-2", name: "Gato Teste", subtypes: ["Gato"] };
  const nonCat = { ...compileCard(raw(3)), id: "other-2", uid: "other-2", name: "Outro", subtypes: ["Dragão"] };
  p0.hand = [herb];
  p0.deck = [cat, nonCat];
  const state = { players: [p0, p1], active: 0, phase: "principal", round: 1, log: [], winner: null, selectedAttackers: [], events: 0, priorityStack: [], pendingResponse: null, pendingDecision: null };
  const played = executeCommand(state, { type: "playCard", owner: 0, handIndex: 0, cardId: herb.id }, { priority: false });
  const resolved = executeCommand(played.state, { type: "resolveDecision", owner: 0, selectedCardIds: ["cat-2"] }, { priority: false });
  assert.equal(resolved.state.players[0].hand.some((card) => (card.uid || card.id) === "cat-2"), true);
  assert.equal(resolved.state.players[0].deck.some((card) => (card.uid || card.id) === "cat-2"), false);
  assert.equal(resolved.state.players[0].deck.some((card) => (card.uid || card.id) === "other-2"), true);
});

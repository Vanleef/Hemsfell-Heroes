import assert from "node:assert/strict";
import test from "node:test";
import { buildAIActionCandidates, tranqueiraComboForecast } from "../app/rules-engine/ai.mjs";

const card = (id, page = 100, cost = 1) => ({ id, page, name: id, type: "Feitiço", cost, text: "", tags: [], abilities: [] });
const player = () => ({
  heroId: "goblin", level: 1, heroXP: 0, levelUpsThisTurn: 0,
  life: 30, maxLife: 30, energy: 6, maxEnergy: 6, reserve: 0,
  deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [],
  cardsPlayed: 0, turnCardsPlayed: 0, turnSpellsPlayed: 0, spellsPlayed: 0,
  coffeeSpells: 0, damageDealt: 0, turnDeaths: 0, abilityUses: {}, nextCardDiscounts: [], nextCreaturePaysLife: false,
});
const state = (energy) => {
  const me = player();
  me.energy = energy;
  me.hand = [card("tranqueira", 46), ...Array.from({ length: 5 }, (_, index) => card(`follow-${index}`))];
  return { active: 0, phase: "principal", round: 3, events: 0, winner: null, players: [me, player()] };
};

test("Hard AI only starts Tranqueira when five legal follow-up cards are payable", () => {
  const ready = state(6);
  assert.equal(tranqueiraComboForecast(ready, 0), 5);
  assert.ok(buildAIActionCandidates(ready, 0, "Difícil").some((action) => action.cardId === "tranqueira"));

  const short = state(5);
  assert.equal(tranqueiraComboForecast(short, 0), 4);
  assert.equal(buildAIActionCandidates(short, 0, "Difícil").some((action) => action.cardId === "tranqueira"), false);
});

test("lower difficulty keeps its permissive, human-error candidate set", () => {
  const short = state(5);
  assert.ok(buildAIActionCandidates(short, 0, "Normal").some((action) => action.cardId === "tranqueira"));
});

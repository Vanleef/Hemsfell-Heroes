import test from "node:test";
import assert from "node:assert/strict";
import { validateCardRecord, validateDeckRecord } from "../app/game-content.mjs";

test("catalogue cards require stable gameplay data", () => {
  assert.deepEqual(validateCardRecord({
    id: "hemsfell-core-071-terremoto",
    setId: "hemsfell-core",
    name: "Terremoto",
    cardType: "Feitiço",
    cost: 4,
    artPage: 71,
    tags: [],
    effects: [{ trigger: "onPlay", kind: "damageAllCreatures" }],
  }), []);
  assert.match(validateCardRecord({ id: "Bad id", cardType: "Não existe", cost: -1 }).join(" "), /stable slug/);
});

test("decks can only point to registered stable card ids", () => {
  const cards = new Map([["hemsfell-core-071-terremoto", {}]]);
  assert.deepEqual(validateDeckRecord({
    id: "uruk-starter",
    heroId: "uruk",
    cards: [{ cardId: "hemsfell-core-071-terremoto", quantity: 2 }],
  }, cards), []);
  assert.match(validateDeckRecord({
    id: "uruk-starter",
    heroId: "uruk",
    cards: [{ cardId: "missing-card", quantity: 0 }],
  }, cards).join(" "), /unknown card/);
});

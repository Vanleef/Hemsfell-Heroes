import test from "node:test";
import assert from "node:assert/strict";
import { adaptCatalogCard, deckEntriesFromPages, stableCardId, validateCardRecord, validateDeckRecord } from "../app/game-content.mjs";

test("catalogue cards require stable gameplay data", () => {
  assert.deepEqual(validateCardRecord({
    id: "hemsfell-core-071-terremoto", setId: "hemsfell-core", name: "Terremoto",
    cardType: "Feitiço", cost: 4, artPage: 71, tags: [], effects: [{ trigger: "onPlay", kind: "damageAllCreatures" }],
  }), []);
  assert.match(validateCardRecord({ id: "Bad id", cardType: "Não existe", cost: -1 }).join(" "), /stable slug/);
});

test("stable catalogue ids and API records preserve gameplay fields", () => {
  assert.equal(stableCardId("hemsfell-core", 71, "Terremoto"), "hemsfell-core-071-terremoto");
  assert.deepEqual(adaptCatalogCard({
    id: "hemsfell-core-071-terremoto", set_id: "hemsfell-core", legacy_page: 71, art_page: 71,
    name: "Terremoto", card_type: "Feitiço", faction: "Divino", cost: 4, attack: null, health: null,
    rules_text: "Cause dano.", tags: [], effects: [], is_image_card: false,
  }).effects, []);
});

test("decks can only point to registered stable card ids", () => {
  const cards = new Map([["hemsfell-core-071-terremoto", {}]]);
  assert.deepEqual(validateDeckRecord({ id: "uruk-starter", heroId: "uruk", cards: [{ cardId: "hemsfell-core-071-terremoto", quantity: 2 }] }, cards), []);
  assert.match(validateDeckRecord({ id: "uruk-starter", heroId: "uruk", cards: [{ cardId: "missing-card", quantity: 0 }] }, cards).join(" "), /unknown card/);
});

test("deck page entries become stable card ids", () => {
  const result = deckEntriesFromPages([{ page: 71, quantity: 2 }], new Map([[71, { id: "hemsfell-core-071-terremoto" }]]));
  assert.deepEqual(result, { entries: [{ cardId: "hemsfell-core-071-terremoto", quantity: 2 }], errors: [] });
});

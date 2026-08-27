import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAIN_DECK_SIZE,
  MAX_COPIES,
  cardAllowedInDeckZone,
  deckIds,
  defaultUserDeck,
  validateUserDeck,
  validateUserDeckDraft,
} from "../app/user-deck.mjs";

const catalog = JSON.parse(await readFile(new URL("../app/cards.generated.json", import.meta.url), "utf8"));

test("every canonical hero deck normalizes to the shared 49-card model", () => {
  for (const heroId of deckIds) {
    const deck = defaultUserDeck(heroId, catalog, `${heroId} test`);
    const validation = validateUserDeck(deck, catalog);
    assert.equal(validation.ok, true, `${heroId}: ${validation.errors.join("; ")}`);
    assert.equal(validation.mainCount, MAIN_DECK_SIZE);
    assert.ok(deck.main.every((entry) => entry.quantity >= 1 && entry.quantity <= MAX_COPIES));
    assert.ok(deck.extra.every((cardId) => cardAllowedInDeckZone(heroId, catalog.find((card) => card.id === cardId), "extra")));
  }
});

test("the canonical Quarion list keeps its intentional shared cards legal", () => {
  const deck = defaultUserDeck("quarion", catalog, "Quarion");
  const pages = new Set(deck.main.map((entry) => catalog.find((card) => card.id === entry.cardId)?.page));
  assert.equal(pages.has(150), true);
  assert.equal(pages.has(151), true);
  assert.equal(pages.has(153), true);
  assert.equal(validateUserDeck(deck, catalog).ok, true);
});

test("client payload cannot exceed copy limits, move Images into Main or cross hero identity", () => {
  const deck = defaultUserDeck("gimble", catalog, "Gimble");
  const tooMany = structuredClone(deck);
  tooMany.main[0].quantity = MAX_COPIES + 1;
  assert.equal(validateUserDeck(tooMany, catalog).ok, false);

  const image = catalog.find((card) => card.imageCard && card.page >= 3 && card.page <= 25);
  if (image) {
    const illegalImage = structuredClone(deck);
    illegalImage.main[0] = { cardId: image.id, quantity: illegalImage.main[0].quantity };
    assert.equal(validateUserDeck(illegalImage, catalog).ok, false);
  }

  const foreign = catalog.find((card) => !card.hero && !card.imageCard && card.page >= 274 && card.page <= 290);
  assert.ok(foreign);
  const wrongIdentity = structuredClone(deck);
  wrongIdentity.main[0] = { cardId: foreign.id, quantity: wrongIdentity.main[0].quantity };
  assert.equal(validateUserDeck(wrongIdentity, catalog).ok, false);
});

test("hero identity, total and duplicate entries are authoritative validation failures", () => {
  const deck = defaultUserDeck("saymon", catalog, "Saymon");
  const wrongHero = { ...structuredClone(deck), heroId: "goblin" };
  assert.equal(validateUserDeck(wrongHero, catalog).ok, false);

  const shortDeck = structuredClone(deck);
  shortDeck.main[0].quantity -= 1;
  assert.equal(validateUserDeck(shortDeck, catalog).ok, false);

  const duplicate = structuredClone(deck);
  duplicate.main.push({ ...duplicate.main[0] });
  assert.equal(validateUserDeck(duplicate, catalog).ok, false);
});

test("safe incomplete drafts persist without weakening match validation", () => {
  const deck = defaultUserDeck("saymon", catalog, "Saymon em edição");
  const draft = structuredClone(deck);
  draft.main[0].quantity -= 1;

  const draftValidation = validateUserDeckDraft(draft, catalog);
  assert.equal(draftValidation.ok, true, draftValidation.errors.join("; "));
  assert.equal(draftValidation.mainCount, MAIN_DECK_SIZE - 1);
  assert.deepEqual(draftValidation.deck, draft);
  assert.equal(validateUserDeck(draft, catalog).ok, false);

  draft.main[0].quantity = MAX_COPIES + 1;
  assert.equal(validateUserDeckDraft(draft, catalog).ok, false);
});

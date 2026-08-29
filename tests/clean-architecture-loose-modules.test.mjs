import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("loose card helpers are compatibility facades over rules-engine cores", async () => {
  const [activationFacade, keywordsFacade, rulesFacade, activationCore] = await Promise.all([
    read("app/card-activation.mjs"),
    read("app/card-keywords.mjs"),
    read("app/game-rules.mjs"),
    read("app/rules-engine/cards/card-activation.mjs"),
  ]);

  assert.match(activationFacade, /rules-engine\/cards\/card-activation\.mjs/);
  assert.match(keywordsFacade, /rules-engine\/cards\/card-keywords\.mjs/);
  assert.match(rulesFacade, /rules-engine\/game-rules\.mjs/);
  assert.match(activationCore, /from "\.\.\/compiler\.mjs"/);
  assert.doesNotMatch(activationFacade, /canActivateCard\s*\(/);
  assert.doesNotMatch(keywordsFacade, /intrinsicKeywordNames\s*\(/);
});

test("rules-engine card core exposes activation and keyword semantics", async () => {
  const cardsIndex = await import("../app/rules-engine/cards/index.mjs");
  assert.equal(typeof cardsIndex.canActivateCard, "function");
  assert.equal(typeof cardsIndex.intrinsicKeywordNames, "function");
});

test("remaining loose domain and infrastructure files are compatibility facades", async () => {
  const [deckFacade, deckTypesFacade, authFacade, combatFacade, tifonFacade] = await Promise.all([
    read("app/user-deck.mjs"),
    read("app/user-deck.d.mts"),
    read("app/chatgpt-auth.ts"),
    read("app/combat-presentation.mjs"),
    read("app/tifon-picker-normalizer.tsx"),
  ]);

  assert.match(deckFacade, /model\/decks\/user-deck\.mjs/);
  assert.match(deckTypesFacade, /model\/decks\/user-deck\.mjs/);
  assert.match(authFacade, /infrastructure\/auth\/chatgpt-auth/);
  assert.match(combatFacade, /presentation\/combat\/combat-presentation\.mjs/);
  assert.match(tifonFacade, /presentation\/setup\/tifon-picker-normalizer/);
  assert.doesNotMatch(deckFacade, /suppliedDeckPages\s*=\s*Object\.freeze/);
  assert.doesNotMatch(authFacade, /safeRelativeReturnPath\s*\(/);
});

test("organized cores retain their public contracts", async () => {
  const [deckCore, combatCore] = await Promise.all([
    import("../app/model/decks/user-deck.mjs"),
    import("../app/presentation/combat/combat-presentation.mjs"),
  ]);

  assert.equal(deckCore.MAIN_DECK_SIZE, 49);
  assert.equal(typeof deckCore.validateUserDeck, "function");
  assert.equal(typeof combatCore.resolvedCombatPresentation, "function");
  assert.equal(typeof combatCore.immediateDirectCombatPresentation, "function");
});

import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

test("app root contains only Next App Router entry files", async () => {
  const entries = await readdir(new URL("../app/", import.meta.url), { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  assert.deepEqual(files, ["globals.css", "layout.tsx", "page.tsx"]);
});

test("rules-engine card core exposes activation and keyword semantics", async () => {
  const cardsIndex = await import("../app/rules-engine/cards/index.mjs");
  assert.equal(typeof cardsIndex.canActivateCard, "function");
  assert.equal(typeof cardsIndex.intrinsicKeywordNames, "function");
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

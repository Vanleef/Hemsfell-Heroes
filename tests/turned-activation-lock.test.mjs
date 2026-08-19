import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import cards from "../app/cards.generated.json" with { type: "json" };
import { canActivateCard } from "../app/card-activation.mjs";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const printed = (page) => compileCard(cards.find((card) => card.page === page));
const player = () => ({
  heroId: "uruk", level: 1, heroXP: 0, markers: {}, abilityUses: {}, life: 30, maxLife: 30,
  energy: 10, maxEnergy: 10, reserve: 3, deck: [], extraDeck: [], hand: [], board: [], support: [],
  terrain: null, grave: [], obscuro: [], turnCardsPlayed: 0, turnSpellsPlayed: 0,
});

test("turned permanents are unavailable to the activation UI even without a tap cost", () => {
  const witch = { ...printed(80), uid: "spectral-witch", slot: 0, enteredRound: 1, exhausted: true, summoning: false, markers: 2 };
  assert.ok(witch.abilities.some((ability) => ability.trigger === "activated"));
  assert.equal(canActivateCard(witch, {
    energy: 10, reserve: 3, life: 30, heroId: "uruk", heroLevel: 1,
    topGrave: undefined, constantMarkers: 2, hasSacrificeTarget: false,
  }), false);
});

test("authoritative engine rejects an activated effect from a turned permanent", () => {
  const witch = { ...printed(80), uid: "spectral-witch", slot: 0, enteredRound: 1, exhausted: true, summoning: false, markers: 2, damage: 0, modifiers: [], grantedKeywords: [] };
  const ability = witch.abilities.find((candidate) => candidate.trigger === "activated");
  const game = { active: 0, phase: "principal", round: 2, cardCatalog: [printed(80)], players: [player(), player()] };
  game.players[0].board.push(witch);
  assert.throws(
    () => executeCommand(game, { type: "activate", owner: 0, sourceId: witch.uid, abilityId: ability.id, markerAmount: 1 }),
    /cannot-tap/,
  );
});

test("turned cards do not expose a clickable activation control", () => {
  const css = readFileSync(new URL("../app/magic-barrier.css", import.meta.url), "utf8");
  assert.match(css, /card-frame:has\(> \.original-card\.is-exhausted\) > \.card-frame-activation/);
  assert.match(css, /visibility:\s*hidden\s*!important/);
  assert.match(css, /pointer-events:\s*none\s*!important/);
});

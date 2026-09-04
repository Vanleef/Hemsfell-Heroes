import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import cards from "../app/data/catalog/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { hasActivatableEffect } from "../app/rules-engine/cards/card-activation.mjs";
import { intrinsicKeywordNames } from "../app/rules-engine/cards/card-keywords.mjs";
import { ascensionSpec } from "../app/rules-engine/cards/ascension.mjs";

const byPage = (page) => compileCard(cards.find((card) => Number(card.page) === page));
const player = (heroId, maxEnergy) => ({
  heroId,
  level: 1,
  life: 30,
  maxLife: 30,
  energy: 1,
  maxEnergy,
  reserve: 0,
  deck: [],
  extraDeck: [],
  hand: [],
  board: [],
  support: [],
  terrain: null,
  grave: [],
  obscuro: [],
  cardsPlayed: 0,
  turnCardsPlayed: 0,
  turnSpellsPlayed: 0,
  spellsPlayed: 0,
  abilityUses: {},
});
const game = (maxEnergy) => ({
  active: 0,
  phase: "principal",
  round: 1,
  players: [player("gimble", maxEnergy), player("goblin", 1)],
  rulesEvents: [],
  pendingDecision: null,
  pendingResponse: null,
  combatAction: null,
});

function setup(maxEnergy) {
  const state = game(maxEnergy);
  const pseudo = { ...byPage(3), id: "valorian-pseudo-hand" };
  const trueDragon = { ...byPage(11), id: "valorian-true-deck" };
  state.players[0].hand.push(pseudo);
  state.players[0].deck.push(trueDragon);
  return state;
}

test("Ascensão X is parsed as a maximum-Energy play threshold", () => {
  const pseudo = byPage(3);
  assert.deepEqual(ascensionSpec(pseudo), {
    threshold: 10,
    label: "Ascensão 10",
    effectText: "Procure por um \"Valorian, o Dragão Verdadeiro\" em sua mão ou deck e coloque-o em campo no lugar de Valorian, o Pseudodragão.",
  });
  assert.equal(hasActivatableEffect(pseudo), false);
  assert.ok(intrinsicKeywordNames(pseudo).includes("Ascensão 10"));
});

test("Valorian does not ascend below the printed maximum-Energy threshold", () => {
  const result = executeCommand(setup(9), {
    type: "playCard",
    owner: 0,
    cardId: "valorian-pseudo-hand",
    slot: 0,
    skipPriority: true,
  }).state;

  assert.equal(result.players[0].energy, 0, "only the printed cost 1 is paid");
  assert.equal(result.players[0].board[0]?.page, 3);
  assert.equal(result.players[0].deck.some((card) => Number(card.page) === 11), true);
  assert.equal(result.players[0].board[0]?.abilities?.some((ability) => ability.trigger === "activated"), false);
});

test("Valorian Ascensão 10 resolves automatically at maxEnergy 10 without spending ten Energy", () => {
  const result = executeCommand(setup(10), {
    type: "playCard",
    owner: 0,
    cardId: "valorian-pseudo-hand",
    slot: 0,
    skipPriority: true,
  }).state;

  assert.equal(result.players[0].energy, 0, "Ascensão is a threshold, not an extra energy cost");
  assert.equal(result.players[0].board.length, 1);
  assert.equal(result.players[0].board[0]?.page, 11);
  assert.match(result.players[0].board[0]?.name || "", /Valorian, o Dragão Verdadeiro/i);
  assert.equal(result.players[0].deck.some((card) => Number(card.page) === 11), false);
});

test("activation affordance is centered above cards and Ascensão UI is never activatable", () => {
  const css = fs.readFileSync("app/presentation/styles/mobile-card-icon-scale-terminal.css", "utf8");
  const runtime = fs.readFileSync("app/presentation/runtime/mobile-touch-input-runtime.tsx", "utf8");
  assert.match(css, /\.card-frame > \.card-frame-activation\s*\{[^}]*top:\s*0\s*!important[^}]*bottom:\s*auto\s*!important[^}]*left:\s*50%\s*!important[^}]*translate\(-50%,/s);
  assert.match(css, /\[data-hh-ascension="true"\][^{]*> \.card-frame-activation\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(runtime, /ASCENSION_TEXT_RE/);
  assert.match(runtime, /data-hh-ascension/);
  assert.match(runtime, /control\.hidden = true/);
});

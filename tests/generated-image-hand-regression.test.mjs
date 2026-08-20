import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { cardPlayTargetPolicy, TargetScope } from "../app/rules-engine/targeting.mjs";

const catalog = cards.map(compileCard);
const printed = (page) => compileCard(cards.find((card) => card.page === page));
const player = (heroId) => ({
  heroId, level: 1, heroXP: 0, markers: {}, abilityUses: {}, life: 30, maxLife: 30,
  energy: 10, maxEnergy: 10, reserve: 0, deck: [], extraDeck: [], hand: [], board: [],
  support: [], terrain: null, grave: [], obscuro: [], turnCardsPlayed: 0, turnSpellsPlayed: 0,
});
const state = () => ({
  active: 0, phase: "principal", round: 2, cardCatalog: catalog, players: [player("rasmus"), player("gimble")],
});
const unit = (card, uid, slot = 0) => ({
  ...card, uid, slot, enteredRound: 1, attackedThisTurn: false, summoning: false, exhausted: false,
  damage: 0, bonusAtk: 0, bonusHp: 0, frozen: false, stunned: false, suffocated: false,
  immobilized: false, defenseUses: 0, markers: 0, modifiers: [], grantedKeywords: [],
});

test("Café Expresso exposes its printed creature target to the hand UI", () => {
  const espresso = printed(230);
  const policy = cardPlayTargetPolicy(espresso);
  assert.equal(policy.selections, 1);
  assert.equal(policy.minimumSelections, 1);
  assert.equal(policy.steps[0].scope, TargetScope.ANY_CREATURE);
});

test("an Image created in hand is normalized as a playable hand card", () => {
  let game = state();
  const machine = unit(printed(229), "espresso-machine", 0);
  const target = unit({ ...printed(212), type: "Criatura" }, "coffee-target", 1);
  game.players[0].support.push(machine);
  game.players[0].board.push(target);

  const ability = machine.abilities.find((candidate) => candidate.trigger === "activated");
  game = executeCommand(game, { type: "activate", owner: 0, sourceId: machine.uid, abilityId: ability.id }).state;

  const espresso = game.players[0].hand.find((card) => card.page === 230);
  assert.ok(espresso);
  assert.equal(espresso.generatedImage, true);
  assert.equal(espresso.imageCard, true);
  assert.equal("uid" in espresso, false, "hand Images must not be rendered as battlefield Units");
  assert.match(espresso.id, /^p230-image-2-/);

  game = executeCommand(game, {
    type: "playCard", owner: 0, cardId: espresso.id, targetIds: [target.uid], skipPriority: true,
  }).state;

  assert.equal(game.players[0].hand.some((card) => card.id === espresso.id), false);
  assert.equal(game.pendingDecision?.kind, "choice");
  assert.equal(game.players[0].grave.some((card) => card.generatedImage), false, "generated Image spell copies dissipate after resolving");
});

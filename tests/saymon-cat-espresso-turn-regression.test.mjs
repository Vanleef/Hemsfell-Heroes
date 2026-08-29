import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/data/catalog/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { chooseAIHeroAbility } from "../app/rules-engine/ai.mjs";

const catalog = cards.map(compileCard);
const byPage = (page) => compileCard(cards.find((card) => Number(card.page) === page));
const unit = (card, uid, slot = 0, extra = {}) => ({
  ...card, uid, slot, enteredRound: 1, summoning: false, exhausted: false,
  attackedThisTurn: false, attacksThisTurn: 0, defenseUses: 0, damage: 0,
  modifiers: [], grantedKeywords: [], temporaryTags: [], markers: {}, ...extra,
});
const player = (heroId, level = 1) => ({
  heroId, level, heroXP: 0, markers: {}, levelUpsThisTurn: 0, life: 30, maxLife: 30,
  energy: 1, maxEnergy: 1, reserve: 0, deck: [], extraDeck: [], hand: [], board: [],
  support: [], terrain: null, grave: [], obscuro: [], turnCardsPlayed: 0,
  turnSpellsPlayed: 0, cardsPlayed: 0, spellsPlayed: 0, lifeLostThisTurn: 0,
  lifeLossEvents: 0, abilityUses: {}, turnDeaths: 0,
});
const state = () => ({
  active: 1, phase: "principal", round: 2, events: 0, cardCatalog: catalog,
  players: [player("rasmus"), player("saymon")],
});

test("Saymon I kills the only Gato de Rua, which returns, and the power cannot be paid twice", () => {
  let game = state();
  const cat = unit(byPage(217), "street-cat", 0);
  // Keep the regression focused on the observed 1-damage lethal case.
  cat.hp = 1;
  game.players[0].board.push(cat);

  game = executeCommand(game, {
    type: "activateHero", owner: 1, abilityId: "saymon-level-1", targetIds: ["street-cat"],
  }).state;

  assert.equal(game.players[1].life, 28, "Saymon pays exactly 2 life once");
  assert.equal(game.players[0].life, 30, "Rasmus hero was not targeted");
  assert.equal(game.players[0].grave.some((card) => Number(card.page) === 217), false, "Gato de Rua must not remain in grave");
  assert.equal(game.players[0].board.some((card) => Number(card.page) === 217), true, "Gato de Rua returns to the field");
  assert.equal(game.players[1].abilityUses["saymon-0"], 1, "presentation usage key is claimed too");

  assert.throws(() => executeCommand(game, {
    type: "activateHero", owner: 1, abilityId: "saymon-level-1", targetIds: ["enemy-hero"],
  }), /ability-not-available/);
  assert.equal(game.players[1].life, 28);
});

test("AI sees Saymon I as used after the authoritative activation", () => {
  let game = state();
  game.players[0].board.push(unit(byPage(217), "street-cat", 0, { hp: 1 }));
  const before = chooseAIHeroAbility(game, 1, "Normal");
  assert.equal(before?.kind, "saymon-damage");
  game = executeCommand(game, { type: "activateHero", owner: 1, abilityId: "saymon-level-1", targetIds: ["street-cat"] }).state;
  const after = chooseAIHeroAbility(game, 1, "Normal");
  assert.notEqual(after?.kind, "saymon-damage", "the AI must not schedule Saymon I twice in one turn");
});

test("playing Máquina de Expresso keeps its activated effect locked on the entry turn", () => {
  let game = state(); game.active = 0; game.round = 3;
  const machineCard = byPage(229);
  game.players[0].energy = machineCard.cost;
  game.players[0].maxEnergy = machineCard.cost;
  game.players[0].hand = [machineCard];

  game = executeCommand(game, {
    type: "playCard", owner: 0, cardId: machineCard.id, slot: 0, skipPriority: true,
  }).state;

  const fresh = game.players[0].support.find((card) => Number(card.page) === 229);
  assert.ok(fresh, "Máquina de Expresso must enter the support zone");
  assert.equal(fresh.enteredRound, 3);
  assert.equal(fresh.summoning, true, "fresh non-creature permanents with activated effects stay activation-locked on entry");
  assert.equal(fresh.activationLockedOnEntry, true, "the UI activation guard must remain locked on the entry turn");

  const ability = fresh.abilities.find((candidate) => candidate.trigger === "activated");
  assert.ok(ability);
  assert.throws(() => executeCommand(game, {
    type: "activate", owner: 0, sourceId: fresh.uid, abilityId: ability.id,
  }), /cannot-tap|summoning-sickness/);
});

test("Máquina de Expresso cannot tap on entry, then creates Café Expresso in hand on a later round", () => {
  let game = state(); game.active = 0; game.round = 3;
  const machineCard = byPage(229), espressoImage = byPage(230);
  assert.ok(machineCard?.abilities?.some((ability) => ability.trigger === "activated"));
  assert.equal(espressoImage.imageCard, true);
  game.players[0].extraDeck.push(espressoImage);

  const fresh = unit(machineCard, "espresso-machine", 0, { enteredRound: 3, summoning: true });
  game.players[0].support.push(fresh);
  const ability = fresh.abilities.find((candidate) => candidate.trigger === "activated");
  assert.throws(() => executeCommand(game, { type: "activate", owner: 0, sourceId: fresh.uid, abilityId: ability.id }), /cannot-tap|summoning-sickness/);

  // Model the following maintenance/turn lifecycle: the artifact is no longer
  // summoning-sick and its entry round is strictly older than the current round.
  game.round = 4;
  game.players[0].support[0].summoning = false;
  const next = executeCommand(game, { type: "activate", owner: 0, sourceId: fresh.uid, abilityId: ability.id }).state;
  assert.equal(next.players[0].support[0].exhausted, true, "Máquina de Expresso turns as its cost");
  const created = next.players[0].hand.find((card) => card.name === "Café Expresso");
  assert.ok(created, "Café Expresso must actually enter the controller hand");
  assert.equal(created.imageCard, true);
  assert.equal(created.generatedImage, true);
});

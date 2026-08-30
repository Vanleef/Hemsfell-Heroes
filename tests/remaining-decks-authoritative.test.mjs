import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/data/catalog/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const catalog = cards.map(compileCard);
const state = (heroId = "quarion", level = 1) => ({
  active: 0, phase: "principal", round: 1, cardCatalog: catalog,
  players: [0, 1].map((owner) => ({ heroId: owner ? "gimble" : heroId, level: owner ? 1 : level, heroXP: 0, markers: {}, abilityUses: {}, life: 30, maxLife: 30, energy: 10, maxEnergy: 10, reserve: 0, deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [], turnCardsPlayed: 0, turnSpellsPlayed: 0 })),
});
const printed = (page, overrides = {}) => ({ ...compileCard(cards.find((card) => card.page === page)), ...overrides });
const unit = (id, overrides = {}) => ({ uid: id, id, name: id, type: "Criatura", cost: 1, atk: 2, hp: 3, text: "", tags: [], subtypes: [], abilities: [], slot: 0, damage: 0, modifiers: [], exhausted: false, summoning: false, ...overrides });

test("Café Expresso Duplo is an accelerated spell in the source catalog", () => {
  const card = cards.find((candidate) => candidate.page === 252);
  assert.equal(card.type, "Feitiço");
  assert.ok(card.tags.includes("Acelerado"));
});

test("Ngoro II and III are active powers that spend clues", () => {
  const levelTwo = state("ngoro", 2); levelTwo.players[0].heroXP = 2; levelTwo.players[0].deck.push({ id: "clue-draw" });
  const choosing = executeCommand(levelTwo, { type: "activateHero", owner: 0, abilityId: "ngoro-level-2" }).state;
  assert.equal(choosing.players[0].heroXP, 0);
  assert.equal(choosing.pendingDecision.kind, "choice");
  const drawn = executeCommand(choosing, { type: "resolveDecision", owner: 0, choiceIndex: 0 }).state;
  assert.equal(drawn.players[0].hand[0].id, "clue-draw");
  assert.equal(drawn.players[0].abilityUses["ngoro-1"], 1);

  const levelThree = state("ngoro", 3); levelThree.players[0].markers = { clue: 3 }; levelThree.players[0].board.push(unit("spy"));
  const hidden = executeCommand(levelThree, { type: "activateHero", owner: 0, abilityId: "ngoro-level-3", targetIds: ["spy"] }).state;
  assert.equal(hidden.players[0].markers.clue, 0);
  assert.ok(hidden.players[0].board[0].temporaryTags.includes("Furtivo"));
  assert.equal(hidden.players[0].abilityUses["ngoro-2"], 1);
});

test("Anel de Ametista turns on activation and cannot be activated twice", () => {
  const game = state("ngoro", 1), ring = { ...printed(267), uid: "amethyst-ring", slot: 0, attachedTo: "chaos", enteredRound: 0, exhausted: false, summoning: false }, chaos = unit("chaos", { tags: ["Caos"] });
  game.players[0].energy = 5; game.players[0].board.push(chaos); game.players[0].support.push(ring);
  const ability = ring.abilities.find((candidate) => candidate.trigger === "activated");
  const activated = executeCommand(game, { type: "activate", owner: 0, sourceId: ring.uid, abilityId: ability.id }).state;
  assert.equal(activated.players[0].support[0].exhausted, true);
  assert.equal(activated.players[0].energy, 6);
  assert.throws(() => executeCommand(activated, { type: "activate", owner: 0, sourceId: ring.uid, abilityId: ability.id }), /ability-limit-reached|cannot-tap/);
});

test("Quarion I draws once and Quarion III repeats the first First Act", () => {
  const game = state("quarion", 3);
  game.players[0].deck.push({ id: "draw-a" }, { id: "draw-b" });
  game.players[1].board.push(unit("enemy", { hp: 8 }));
  game.players[0].hand.push(printed(188, { id: "quarion-act", cost: 0 }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "quarion-act", slot: 0, targetIds: ["enemy", "enemy"], skipPriority: true }).state;
  assert.equal(result.players[1].board[0].damage, 2);
  assert.equal(result.players[0].hand.length, 1);
});

test("Quarion II returns the first allied lethal creature to hand", () => {
  const game = state("quarion", 2), ally = unit("ally", { damage: 2 });
  game.players[0].board.push(ally); game.players[1].hand.push({ id: "ping", name: "Ping", type: "Feitiço", cost: 0, tags: ["Acelerado"], abilities: [{ id: "ping", trigger: "onPlay", costs: [], effects: [{ type: "damage", target: "anyCreature", amount: 1 }] }] });
  const result = executeCommand(game, { type: "playCard", owner: 1, cardId: "ping", targetIds: ["ally"], hasPriority: true, skipPriority: true }).state;
  assert.equal(result.players[0].board.length, 0);
  assert.equal(result.players[0].hand.length, 1);
  assert.equal(result.players[0].grave.length, 0);
});

test("Rasmus III accepts Cats in support and Nature II adds one action marker", () => {
  const rasmus = state("rasmus", 3); rasmus.players[0].hand.push(printed(214, { id: "support-cat", cost: 0 }));
  const placed = executeCommand(rasmus, { type: "playCard", owner: 0, cardId: "support-cat", slot: 2, placementZone: "support", skipPriority: true }).state;
  assert.equal(placed.players[0].support[0].id, "support-cat");

  const nature = state("natureza", 2), target = unit("constant"); nature.players[0].board.push(target);
  const marked = executeCommand(nature, { type: "emit", owner: 0, event: { type: "noop", owner: 0 } }, { handlers: {} }).state;
  const effectState = structuredClone(marked);
  const source = { ...printed(292), uid: "marker-source", enteredRound: 0, summoning: false, exhausted: false, slot: 1 };
  effectState.players[0].board.push(source);
  const ability = source.abilities.find((entry) => entry.trigger === "activated");
  const resolved = executeCommand(effectState, { type: "activate", owner: 0, sourceId: source.uid, abilityId: ability.id, targetIds: ["constant"] }).state;
  assert.equal(resolved.players[0].board.find((card) => card.uid === "constant").markers.action, 2);
});

test("Zayan II pauses an imminent destruction and can replace it", () => {
  const game = state("zayan", 2), original = unit("original"), replacement = unit("replacement", { text: "Algum efeito" });
  game.players[0].board.push(original, replacement);
  game.players[1].hand.push({ id: "destroyer", name: "Destroyer", type: "Feitiço", cost: 0, tags: [], abilities: [{ id: "destroy", trigger: "onPlay", costs: [], effects: [{ type: "destroy", target: "anyCreature", selections: 1 }] }] });
  game.active = 1;
  const pending = executeCommand(game, { type: "playCard", owner: 1, cardId: "destroyer", targetIds: ["original"], skipPriority: true }).state;
  assert.equal(pending.pendingDecision.kind, "zayan-destruction-replacement");
  const resolved = executeCommand(pending, { type: "resolveDecision", owner: 0, choiceIndex: 1, targetIds: ["replacement"] }).state;
  assert.ok(resolved.players[0].board.some((card) => card.uid === "original"));
  assert.ok(!resolved.players[0].board.some((card) => card.uid === "replacement"));
});

test("Despertar da Noite heals only the damage actually applied", () => {
  const game = state("saymon", 1); game.players[0].life = 20;
  game.players[0].board.push(unit("ally", { hp: 1 }));
  game.players[1].board.push(unit("robust", { hp: 5, tags: ["Robusto"] }), unit("normal", { hp: 5, slot: 1 }));
  game.players[0].hand.push(printed(144, { id: "awakening", cost: 0 }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "awakening", skipPriority: true }).state;
  assert.equal(result.players[0].life, 24);
});

test("Diálogo counts a destruction caused by the equipped Recruit's effect exactly once", () => {
  const game = state("quarion", 1), recruit = { ...printed(187), uid: "fighter", slot: 0, damage: 0, modifiers: [], abilities: printed(187).abilities, exhausted: false, summoning: false };
  game.players[0].board.push(recruit);
  game.players[0].hand.push(printed(193, { id: "hammer", cost: 0 }));
  const equipped = executeCommand(game, { type: "playCard", owner: 0, cardId: "hammer", slot: 0, attachedTo: "fighter", skipPriority: true }).state;
  const resolved = executeCommand(equipped, { type: "emit", owner: 0, event: { type: "onCreatureDestroyed", owner: 1, destroyedBySourceId: "fighter" } }).state;
  const live = resolved.players[0].board.find((card) => card.uid === "fighter");
  assert.equal(live.name, "Bruto Bom de Papo");
  assert.equal(live.modifiers.filter((modifier) => modifier.duration === "permanent").reduce((sum, modifier) => sum + (modifier.attack || 0), 0), 1);
});

test("Estandarte special Support aura disappears with its attachment", () => {
  const game = state("quarion", 1), recruit = { ...printed(186), uid: "solidary", slot: 1, damage: 0, modifiers: [], abilities: printed(186).abilities, exhausted: false, summoning: false }, adjacent = unit("adjacent", { slot: 2 });
  game.players[0].board.push(recruit, adjacent);
  game.players[0].hand.push(printed(194, { id: "banner", cost: 0 }));
  const equipped = executeCommand(game, { type: "playCard", owner: 0, cardId: "banner", slot: 1, attachedTo: "solidary", skipPriority: true }).state;
  assert.equal(equipped.players[0].board.find((card) => card.uid === "adjacent").modifiers.find((modifier) => modifier.duration === "support")?.attack, 2);
  equipped.players[0].support = [];
  const detached = executeCommand(equipped, { type: "emit", owner: 0, event: { type: "noop", owner: 0 } }).state;
  assert.equal(detached.players[0].board.find((card) => card.uid === "adjacent").modifiers.some((modifier) => modifier.duration === "support"), false);
});

test("Máscara da Aranha Rainha recalculates its blocking restriction continuously", () => {
  const game = state("natureza", 1), attacker = unit("masked", { slot: 0 }), nature = unit("nature", { slot: 1, tags: ["Natureza"] }), defender = unit("ground-defender");
  game.players[0].board.push(attacker, nature); game.players[1].board.push(defender);
  game.players[0].hand.push(printed(305, { id: "mask", cost: 0 }));
  const equipped = executeCommand(game, { type: "playCard", owner: 0, cardId: "mask", slot: 0, attachedTo: "masked", skipPriority: true }).state;
  equipped.phase = "combate";
  assert.throws(() => executeCommand(equipped, { type: "attack", owner: 0, attackerId: "masked", defenderId: "ground-defender", skipPriority: true }), /invalid-defender/);
  const withoutOtherNature = structuredClone(equipped); withoutOtherNature.players[0].board = withoutOtherNature.players[0].board.filter((card) => card.uid !== "nature");
  const resolved = executeCommand(withoutOtherNature, { type: "attack", owner: 0, attackerId: "masked", defenderId: "ground-defender", skipPriority: true }).state;
  assert.equal(resolved.players[1].board.find((card) => card.uid === "ground-defender")?.damage, 2);
});

test("Nature I targets one or two constants and Nature II adds one marker to each", () => {
  const game = state("natureza", 2), first = unit("first"), second = unit("second", { slot: 1 }); game.players[0].board.push(first, second);
  const result = executeCommand(game, { type: "activateHero", owner: 0, abilityId: "natureza-level-1", targetIds: ["first", "second"] }).state;
  assert.equal(result.players[0].board.find((card) => card.uid === "first").markers.action, 3);
  assert.equal(result.players[0].board.find((card) => card.uid === "second").markers.action, 3);
});

test("CRIATURA 9 removes exactly five selected markers before the chosen search", () => {
  const game = state("natureza", 1), source = { ...printed(300), uid: "nature-nine", slot: 0, damage: 0, modifiers: [], abilities: printed(300).abilities, exhausted: false, summoning: false, markers: { action: 2 } }, donor = unit("donor", { slot: 1, markers: { action: 4 } }), wanted = printed(242, { uid: "wanted" });
  game.players[0].board.push(source, donor); game.players[0].deck.push(wanted);
  const payment = executeCommand(game, { type: "activate", owner: 0, sourceId: "nature-nine", abilityId: source.abilities.find((ability) => ability.trigger === "activated").id }).state;
  assert.equal(payment.pendingDecision.kind, "marker-payment-search");
  const search = executeCommand(payment, { type: "resolveDecision", owner: 0, markerSelections: [{ id: "nature-nine", amount: 2 }, { id: "donor", amount: 3 }] }).state;
  assert.equal(search.pendingDecision.kind, "search");
  const resolved = executeCommand(search, { type: "resolveDecision", owner: 0, selectedCardId: "wanted" }).state;
  assert.equal(resolved.players[0].hand[0].uid, "wanted");
  assert.equal(resolved.players[0].board.find((card) => card.uid === "donor").markers.action, 1);
});

test("Mordida Fatal moves itself to the deck bottom and still publishes destruction", () => {
  const game = state("saymon", 1), victim = unit("victim", { hp: 2, abilities: [{ id: "last-breath", trigger: "onDestroyed", costs: [], effects: [{ type: "draw", amount: 1 }] }] }); game.players[0].life = 20; game.players[1].deck.push({ id: "death-draw" }); game.players[1].board.push(victim); game.players[0].hand.push(printed(145, { id: "fatal", cost: 0 }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "fatal", targetIds: ["victim"], skipPriority: true }).state;
  assert.equal(result.players[1].board.length, 0);
  assert.equal(result.players[0].grave.some((card) => card.page === 145), false);
  assert.equal(result.players[0].deck.at(-1)?.page, 145);
  assert.equal(result.players[1].hand[0]?.id, "death-draw");
});

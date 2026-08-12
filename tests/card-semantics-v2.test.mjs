import assert from "node:assert/strict";
import test from "node:test";
import { compileCard, compileCardText } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { defaultEffectHandlers } from "../app/rules-engine/effects.mjs";

const baseCard = (page, name, type, extra = {}) => compileCard({
  page,
  id: `p${page}`,
  name,
  type,
  cost: 0,
  text: "",
  tags: [],
  image: "",
  hero: false,
  imageCard: false,
  ...extra,
});

const player = () => ({
  heroId: "gimble",
  level: 1,
  heroXP: 0,
  levelUpsThisTurn: 0,
  life: 30,
  maxLife: 30,
  maxEnergy: 10,
  energy: 10,
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
  nextCardDiscounts: [],
});

const state = () => ({
  active: 0,
  phase: "principal",
  round: 1,
  players: [player(), player()],
  cardCatalog: [],
  log: [],
  selectedAttackers: [],
  events: 0,
  winner: null,
});

const creature = (uid, name = "Alvo", slot = 0) => ({
  ...baseCard(999, name, "Criatura", { atk: 2, hp: 2 }),
  uid,
  slot,
  enteredRound: 0,
  damage: 0,
  exhausted: false,
  summoning: false,
  markers: 0,
  modifiers: [],
});

test("Fura-Fila is bounded to the sentence after its label", () => {
  const compiled = compileCardText("Veloz. Fura-fila: Recebe +2 de Ofensividade. Compre 1 carta.");
  const combo = compiled.abilities.find((ability) => ability.furaFila);
  assert.ok(combo);
  assert.equal(combo.condition.cardsPlayedBeforeThisAtLeast, 1);
  assert.match(combo.furaFila.clause, /Ofensividade/);
  assert.doesNotMatch(combo.furaFila.clause, /Compre 1 carta/);
  assert.equal(combo.effects.some((effect) => effect.type === "modifyStats" && effect.attack === 2), true);
  assert.equal(compiled.abilities.some((ability) => ability !== combo && ability.effects.some((effect) => effect.type === "draw")), true);
});

test("passive compiler metadata records scenario and once-per-turn limits", () => {
  const compiled = compileCardText("Uma vez por turno, sempre que uma criatura entrar em campo, compre 1 carta.");
  const ability = compiled.abilities[0];
  assert.deepEqual(ability.usageLimit, { count: 1, period: "turn" });
  assert.equal(ability.triggerMeta.kind, "conditional-passive");
  assert.match(ability.triggerMeta.scenario, /sempre que/i);
});

test("Dragão Jovem and Dragão Ancião First Act target any creature", () => {
  const young = baseCard(24, "Dragão Jovem", "Criatura", { imageCard: true, atk: 4, hp: 2 });
  const elder = baseCard(25, "Dragão Ancião", "Criatura", { imageCard: true, atk: 6, hp: 3 });
  assert.equal(young.abilities.find((ability) => ability.trigger === "onEnter").effects[0].target, "anyCreature");
  assert.equal(elder.abilities.find((ability) => ability.trigger === "onEnter").effects[0].target, "anyCreature");
});

test("Image First Act with no other valid creature summons without opening a target decision", () => {
  const game = state();
  const spell = baseCard(12, "Ilusão Dracônica Menor", "Feitiço", { cost: 2 });
  const hatchling = baseCard(23, "Dragão Filhote", "Criatura", { imageCard: true, atk: 2, hp: 1 });
  game.players[0].hand.push(spell);
  game.players[0].extraDeck.push(hatchling);
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: spell.id, skipPriority: true }).state;
  const created = result.players[0].board.find((card) => card.name === "Dragão Filhote");
  assert.ok(created);
  assert.equal(created.summoning, true);
  assert.equal(result.pendingDecision ?? null, null);
});

test("newly summoned Image cannot target itself but an older copy can be selected", () => {
  const game = state();
  const spell = baseCard(12, "Ilusão Dracônica Menor", "Feitiço", { cost: 2 });
  const hatchling = baseCard(23, "Dragão Filhote", "Criatura", { imageCard: true, atk: 2, hp: 1 });
  const older = { ...hatchling, uid: "older-hatchling", slot: 2, generatedImage: true, imageCard: true, enteredRound: 0, summoning: false, exhausted: false, damage: 0, markers: 0, modifiers: [] };
  game.players[0].board.push(older);
  game.players[0].hand.push(spell);
  game.players[0].extraDeck.push(hatchling);
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: spell.id, skipPriority: true }).state;
  const created = result.players[0].board.find((card) => card.name === "Dragão Filhote" && card.uid !== older.uid);
  assert.ok(created);
  assert.equal(result.pendingDecision?.kind, "targets");
  assert.equal(result.pendingDecision?.targetSteps?.[0]?.excludeIds?.includes(created.uid), true);
  assert.equal(result.pendingDecision?.targetSteps?.[0]?.excludeIds?.includes(older.uid), false);
  const resolved = executeCommand(result, { type: "resolveDecision", owner: 0, targetIds: [older.uid] }).state;
  assert.equal(resolved.pendingDecision ?? null, null);
});

test("Image Artifact inherits Artifact type and enters with activation sickness", () => {
  const game = state();
  const host = creature("host-goblin", "Goblin Teste", 1);
  host.subtypes = ["Goblin"];
  game.players[0].board.push(host);
  game.players[0].extraDeck.push({ page: 998, id: "image-artifact", name: "Artefato Imagem", type: "Artefato", cost: 0, text: "", tags: [], image: "", hero: false, imageCard: true, abilities: [] });
  defaultEffectHandlers.createImage(game, { type: "createImage", name: "Artefato Imagem", destination: "field" }, { owner: 0, attachedTo: host.uid });
  const artifact = game.players[0].support.find((card) => card.name === "Artefato Imagem");
  assert.ok(artifact);
  assert.equal(artifact.type, "Artefato");
  assert.equal(artifact.summoning, true);
  assert.equal(artifact.attachedTo, host.uid);
});

test("TRAMBUCO DO PIPOCO is explicit, typed and once-per-turn", () => {
  const card = baseCard(38, "TRAMBUCO DO PIPOCO", "Artefato", { text: "No seu turno, você pode equipar este artefato em qualquer Goblin à sua escolha. Ele recebe Veloz e +2 de Ofensividade. Se o Goblin equipado for destruído, você pode pagar 2 de energia para equipar este artefato em outro Goblin." });
  const enter = card.abilities.find((ability) => ability.trigger === "onEnter");
  const activated = card.abilities.find((ability) => ability.trigger === "activated");
  const passive = card.abilities.find((ability) => ability.trigger === "onAttachedHostDestroyed");
  assert.ok(enter?.effects.some((effect) => effect.type === "attachedStats" && effect.attack === 2));
  assert.ok(enter?.effects.some((effect) => effect.type === "attachedKeyword" && effect.keyword === "Veloz"));
  assert.deepEqual(activated?.usageLimit, { count: 1, period: "turn" });
  assert.ok(activated?.effects.some((effect) => effect.type === "reattachArtifact" && effect.subtype === "Goblin"));
  assert.equal(passive?.triggerMeta.kind, "conditional-passive");
  assert.ok(passive?.effects.some((effect) => effect.type === "optionalReequipArtifact" && effect.energyCost === 2));
});

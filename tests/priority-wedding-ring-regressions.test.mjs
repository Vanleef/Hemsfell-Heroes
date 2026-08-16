import assert from "node:assert/strict";
import test from "node:test";
import { executeCommand, propagateWeddingRingLinks } from "../app/rules-engine/engine.mjs";
import { legalPriorityResponses } from "../app/rules-engine/priority.mjs";

const player = () => ({
  heroId: "gimble",
  level: 1,
  heroXP: 0,
  levelUpsThisTurn: 0,
  life: 30,
  maxLife: 30,
  energy: 5,
  maxEnergy: 5,
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
  coffeeSpells: 0,
  damageDealt: 0,
  turnDeaths: 0,
  abilityUses: {},
  pendingTranqueira: false,
  nextCardDiscount: 0,
  nextNonCreatureDiscount: 0,
  nextSpellDiscount: 0,
  nextSummonPaysLife: false,
  catsEnteredThisTurn: 0,
});

const state = () => ({
  active: 0,
  phase: "principal",
  round: 1,
  players: [player(), player()],
  log: [],
  winner: null,
  selectedAttackers: [],
  events: 0,
});

const card = (id, name, type, cost, extra = {}) => ({ id, name, type, cost, text: "", tags: [], abilities: [], ...extra });
const unit = (uid, name, page) => ({ ...card(uid, name, "Criatura", 2, { page, atk: 2, hp: 2 }), uid, slot: 0, damage: 0, bonusAtk: 0, bonusHp: 0, markers: 0, exhausted: false, summoning: false, frozen: false, stunned: false, suffocated: false, immobilized: false, defenseUses: 0 });

test("the original card cost is paid before the response window is exposed", () => {
  const game = state();
  game.players[0].hand.push(
    card("root-creature", "Criatura de custo 3", "Criatura", 3, { atk: 3, hp: 3 }),
    card("expensive-fast", "Resposta cara", "Feitiço", 5, { tags: ["Acelerado"] }),
  );

  const opened = executeCommand(game, { type: "playCard", owner: 0, cardId: "root-creature", fieldSlot: 0 }, { priority: true }).state;
  assert.equal(opened.players[0].energy, 2, "the root action must reserve/pay its 3 energy before priority opens");
  assert.equal(opened.pendingAction.cardId, "root-creature");
  assert.equal(opened.pendingResponse.responder, 1);

  const returned = executeCommand(opened, { type: "passPriority", owner: 1 }, { priority: true }).state;
  assert.equal(returned.pendingResponse.responder, 0, "priority returns to the actor after the opponent passes");
  assert.equal(legalPriorityResponses(returned, 0).some((response) => response.cardId === "expensive-fast"), false, "a cost-5 response cannot be offered with only 2 resources left");

  const resolved = executeCommand(returned, { type: "passPriority", owner: 0 }, { priority: true }).state;
  assert.equal(resolved.players[0].energy, 2, "the root cost is charged exactly once after resolution");
  assert.equal(resolved.players[0].hand.some((candidate) => candidate.id === "root-creature"), false);
  assert.equal(resolved.players[0].board.some((candidate) => candidate.id === "root-creature"), true);
});

test("an accelerated response pays its reserve before giving priority away", () => {
  const game = state();
  game.players[1].reserve = 3;
  game.players[1].hand.push(card("fast", "Resposta Acelerada", "Feitiço", 2, { tags: ["Acelerado"] }));
  game.pendingAction = { type: "playCard", owner: 0, cardId: "root" };
  game.pendingResponse = { responder: 1, actor: 0, action: "Ação original", passes: 0 };
  game.players[0].hand.push(card("root", "Ação original", "Feitiço", 0));

  const stacked = executeCommand(game, { type: "playCard", owner: 1, cardId: "fast", hasPriority: true }, { priority: true }).state;
  assert.equal(stacked.players[1].reserve, 1);
  assert.equal(stacked.players[1].energy, 5, "off-turn accelerated cards do not consume main energy");
  assert.equal(stacked.pendingResponse.responder, 0);
});

test("Anel de Casamento follows a linked creature to the same known destination", () => {
  const before = state();
  const first = unit("first", "Primeira", 500);
  const second = { ...unit("second", "Segunda", 501), slot: 1 };
  before.players[0].board.push(first, second);
  before.players[0].support.push({ ...card("ring", "Anel de Casamento", "Artefato", 1, { page: 150 }), uid: "ring-1", slot: 0, attachedTo: "first", linkedCreatures: ["first", "second"], exhausted: false, summoning: false, markers: 0 });

  const after = structuredClone(before);
  after.players[0].board = after.players[0].board.filter((candidate) => candidate.uid !== "first");
  after.players[0].hand.push({ id: first.id, page: first.page, name: first.name, type: first.type, cost: first.cost, text: first.text, tags: first.tags, abilities: first.abilities, atk: first.atk, hp: first.hp });
  after.players[0].support = [];

  propagateWeddingRingLinks(before, after);
  assert.equal(after.players[0].board.some((candidate) => candidate.uid === "second"), false);
  assert.equal(after.players[0].hand.some((candidate) => candidate.name === "Segunda"), true, "the linked creature follows the first creature to hand");
});

test("Anel de Casamento falls back to the graveyard when the destination is ambiguous", () => {
  const before = state();
  const first = unit("first", "Primeira", 500);
  const second = { ...unit("second", "Segunda", 501), slot: 1 };
  before.players[0].board.push(first, second);
  before.players[0].support.push({ ...card("ring", "Anel de Casamento", "Artefato", 1, { page: 150 }), uid: "ring-1", slot: 0, attachedTo: "first", linkedCreatures: ["first", "second"], exhausted: false, summoning: false, markers: 0 });

  const after = structuredClone(before);
  after.players[0].board = after.players[0].board.filter((candidate) => candidate.uid !== "first");
  after.players[0].support = [];

  propagateWeddingRingLinks(before, after);
  assert.equal(after.players[0].board.some((candidate) => candidate.uid === "second"), false);
  assert.equal(after.players[0].grave.some((candidate) => candidate.name === "Segunda"), true);
});

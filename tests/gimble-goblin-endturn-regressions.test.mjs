import assert from "node:assert/strict";
import test from "node:test";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const player = () => ({
  heroId: "gimble",
  level: 1,
  heroXP: 0,
  life: 30,
  maxLife: 30,
  energy: 10,
  maxEnergy: 10,
  reserve: 0,
  deck: [],
  extraDeck: [],
  hand: [],
  board: [],
  support: [],
  terrain: null,
  grave: [],
  obscuro: [],
  abilityUses: {},
  turnCardsPlayed: 0,
  cardsPlayed: 0,
  turnSpellsPlayed: 0,
  spellsPlayed: 0,
});

const gameState = () => ({
  active: 0,
  phase: "principal",
  round: 3,
  winner: null,
  events: 0,
  players: [player(), player()],
});

const unit = (id, ownerSlot, hp = 5) => ({
  uid: id,
  id,
  name: id,
  type: "Criatura",
  cost: 0,
  atk: 0,
  hp,
  damage: 0,
  slot: ownerSlot,
  tags: [],
  subtypes: [],
  abilities: [],
  modifiers: [],
  exhausted: false,
  summoning: false,
  stunned: false,
  immobilized: false,
  suffocated: false,
  defenseUses: 0,
});

const card = (definition) => compileCard({
  tags: [],
  subtypes: [],
  hero: false,
  imageCard: false,
  text: "",
  ...definition,
});

test("Dragão de Limo causa 2 de dano a todas as criaturas ao morrer", () => {
  const slime = card({
    page: 10,
    id: "p10",
    name: "Dragão de Limo",
    type: "Criatura",
    cost: 5,
    atk: 4,
    hp: 1,
    text: "Atropelar. Ultimo Suspiro: Explode em acido, causando 2 de dano a todas as criaturas em campo.",
    tags: ["Atropelar"],
    subtypes: ["Dragão"],
  });
  const destroyer = card({
    id: "kill-slime",
    name: "Teste de destruição",
    type: "Feitiço",
    cost: 0,
    text: "Cause 1 de dano a uma criatura.",
  });
  const game = gameState();
  game.players[0].board.push({ ...slime, uid: "slime", slot: 0, damage: 0, modifiers: [], exhausted: false, summoning: false, defenseUses: 0 });
  game.players[0].board.push(unit("ally-survivor", 1));
  game.players[1].board.push(unit("enemy-survivor", 0));
  game.players[1].hand.push(destroyer);
  game.active = 1;

  const result = executeCommand(game, {
    type: "playCard",
    owner: 1,
    cardId: destroyer.id,
    targetIds: ["slime"],
    skipPriority: true,
  }, { priority: false }).state;

  assert.ok(result.players[0].grave.some((entry) => entry.page === 10), "o Dragão de Limo deve morrer");
  assert.equal(result.players[0].board.find((entry) => entry.uid === "ally-survivor")?.damage, 2, "criatura aliada também recebe o dano global");
  assert.equal(result.players[1].board.find((entry) => entry.uid === "enemy-survivor")?.damage, 2, "criatura inimiga também recebe o dano global");
});

test("TRANQUEIRA-MÁTICA ELETROSTÁTICA deixa o campo no fim do mesmo turno", () => {
  const tranqueira = card({
    page: 46,
    id: "p46",
    name: "TRANQUEIRA-MÁTICA ELETROSTÁTICA",
    type: "Feitiço",
    cost: 1,
    text: "Jogue quantas cartas quiser para tentar gerar 1 imagem de uma bugiganga no fim do seu turno: 1-4 cartas: Você sofre 1 de dano para cada carta. 5 cartas: BUCHA DE CANHÃO 6 cartas: TRAMBUCO DE PIPOCO 7+ cartas: CARCAÇA CHUMBADA DE TANQUE",
  });
  const followUp = card({
    id: "follow-up",
    name: "Carta posterior",
    type: "Feitiço",
    cost: 0,
    text: "Compre 0 cartas.",
  });
  const game = gameState();
  game.players[0].heroId = "goblin";
  game.players[0].hand.push(tranqueira, followUp);

  let state = executeCommand(game, {
    type: "playCard",
    owner: 0,
    cardId: tranqueira.id,
    slot: 0,
    skipPriority: true,
  }, { priority: false }).state;

  const live = state.players[0].support.find((entry) => entry.page === 46);
  assert.ok(live, "a Tranqueira fica em campo apenas enquanto acompanha o turno atual");
  assert.equal(live.cardsPlayedAfterSelf, 0);

  state = executeCommand(state, {
    type: "playCard",
    owner: 0,
    cardId: followUp.id,
    skipPriority: true,
  }, { priority: false }).state;
  assert.equal(state.players[0].support.find((entry) => entry.page === 46)?.cardsPlayedAfterSelf, 1);

  state = executeCommand(state, { type: "advancePhase", owner: 0, skipPriority: true }, { priority: false }).state;
  assert.equal(state.phase, "combate");
  state = executeCommand(state, { type: "advancePhase", owner: 0, skipPriority: true }, { priority: false }).state;

  assert.equal(state.phase, "fim");
  assert.equal(state.players[0].support.some((entry) => entry.page === 46), false, "a Tranqueira não pode sobreviver à Finalização do turno em que foi usada");
  assert.ok(state.players[0].grave.some((entry) => entry.page === 46), "após resolver, a Tranqueira vai para o Cemitério");
  assert.equal(state.players[0].life, 29, "uma carta jogada depois dela causa exatamente 1 de dano na faixa 1-4");
});

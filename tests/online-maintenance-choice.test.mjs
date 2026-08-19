import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { executeOnlineCommand } from "../app/rules-engine/online-priority-engine.mjs";

const card = (id) => ({ id, uid: id, name: id, type: "Criatura", cost: 1, atk: 1, hp: 1, text: "", tags: [], subtypes: [], abilities: [], modifiers: [] });
const player = () => ({
  heroId: "saymon", level: 1, life: 30, maxLife: 30,
  energy: 0, maxEnergy: 2, reserve: 0,
  hand: [], deck: [card("a"), card("b"), card("c")], extraDeck: [], grave: [], obscuro: [],
  board: [], support: [], terrain: null, abilityUses: {}, markers: {}, heroXP: 0,
  turnCardsPlayed: 0, turnSpellsPlayed: 0,
});
const state = (round = 2) => ({ active: 0, phase: "manutencao", round, events: 0, winner: null, players: [player(), player()] });

test("Online maintenance +energy choice is authoritative and enters Principal", () => {
  const result = executeOnlineCommand(state(), { type: "maintenanceChoice", owner: 0, drawTwo: false }).state;
  assert.equal(result.phase, "principal");
  assert.equal(result.players[0].maxEnergy, 3);
  assert.equal(result.players[0].energy, 3);
  assert.equal(result.players[0].hand.length, 1);
  assert.equal(result.players[0].deck.length, 2);
});

test("Online maintenance draw-two choice keeps max energy and draws two after round one", () => {
  const result = executeOnlineCommand(state(), { type: "maintenanceChoice", owner: 0, drawTwo: true }).state;
  assert.equal(result.phase, "principal");
  assert.equal(result.players[0].maxEnergy, 2);
  assert.equal(result.players[0].energy, 2);
  assert.equal(result.players[0].hand.length, 2);
  assert.equal(result.players[0].deck.length, 1);
});

test("first maintenance always uses +energy/draw-one even if drawTwo is requested", () => {
  const result = executeOnlineCommand(state(1), { type: "maintenanceChoice", owner: 0, drawTwo: true }).state;
  assert.equal(result.players[0].maxEnergy, 3);
  assert.equal(result.players[0].hand.length, 1);
});

test("non-active player cannot resolve the maintenance choice", () => {
  assert.throws(() => executeOnlineCommand(state(), { type: "maintenanceChoice", owner: 1, drawTwo: false }), /maintenance-choice-unavailable/);
});

test("empty deck at maintenance is an authoritative defeat", () => {
  const game = state();
  game.players[0].deck = [];
  const result = executeOnlineCommand(game, { type: "maintenanceChoice", owner: 0, drawTwo: false }).state;
  assert.equal(result.winner, 1);
  assert.equal(result.players[0].life, 0);
});

test("Online client sends maintenanceChoice instead of relying on legacy sync", async () => {
  const [page, machine, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /mode==="online"\)\{void runRulesCommand\(\{type:"maintenanceChoice",drawTwo:two\},0\)/);
  assert.match(machine, /"maintenanceChoice"/);
  assert.match(route, /legacy state sync disabled; use authoritative commands/);
});

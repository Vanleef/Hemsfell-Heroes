import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { auditCards, compileCardText } from "../app/rules-engine/compiler.mjs";
import { executeCommand, RulesLoopError } from "../app/rules-engine/engine.mjs";
import { runHeadlessGames } from "../app/rules-engine/simulator.mjs";

const state = () => ({ active: 0, phase: "principal", round: 1, players: [0, 1].map(() => ({ life: 30, maxLife: 30, energy: 5, maxEnergy: 5, reserve: 0, deck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [] })) });

test("complex card text composes ordered primitives", () => {
  const result = compileCardText("Primeiro Ato: Compre 2 cartas e cause 1 de dano a uma criatura.");
  assert.equal(result.abilities[0].trigger, "onEnter");
  assert.deepEqual(result.abilities[0].effects.map((effect) => effect.type), ["draw", "damage"]);
});

test("triggered costs do not become manually activated abilities", () => {
  const result = compileCardText("Último Suspiro: Sacrifique uma criatura. Compre 1 carta.");
  assert.equal(result.abilities[0].trigger, "onDestroyed");
  assert.equal(result.abilities[0].costs.length, 0);
  assert.ok(result.abilities[0].effects.some((effect) => effect.type === "sacrifice"));
});

test("manual tap, marker, sacrifice, energy and life costs are explicit", () => {
  const text = "Vire: Remova 2 marcadores. Sacrifique uma criatura. Pague 1 de energia e perca 2 de vida: compre 1 carta.";
  assert.deepEqual(compileCardText(text).abilities[0].costs.map((cost) => cost.type), ["tap", "removeMarkers", "sacrifice", "energy", "life"]);
});

test("sacrifice suppresses death triggers by rulebook definition", () => {
  const game = state(); game.players[0].board.push({ uid: "cost", id: "cost", abilities: [] }, { uid: "source", id: "source", exhausted: false, summoning: false, abilities: [{ id: "a", trigger: "activated", costs: [{ type: "sacrifice", amount: 1 }], effects: [{ type: "draw", amount: 1 }] }] }); game.players[0].deck.push({ id: "drawn" });
  const result = executeCommand(game, { type: "activate", owner: 0, sourceId: "source", abilityId: "a", sacrificeIds: ["cost"] });
  assert.equal(result.state.players[0].grave[0].suppressDeathTrigger, true); assert.equal(result.state.players[0].hand[0].id, "drawn");
});

test("engine rejects activations outside the controller turn", () => {
  const game = state(); game.players[1].board.push({ uid: "source", abilities: [{ id: "a", trigger: "activated", costs: [], effects: [{ type: "draw", amount: 1 }] }] });
  assert.throws(() => executeCommand(game, { type: "activate", owner: 1, sourceId: "source", abilityId: "a" }), /not-your-turn/);
});

test("reserve energy pays spells but never creatures", () => {
  const spellGame = state(); spellGame.players[0].energy = 0; spellGame.players[0].reserve = 2; spellGame.players[0].hand.push({ id: "spell", type: "Feitiço", cost: 2, tags: [], text: "", abilities: [] });
  assert.equal(executeCommand(spellGame, { type: "playCard", owner: 0, cardId: "spell" }).state.players[0].reserve, 0);
  const creatureGame = state(); creatureGame.players[0].energy = 0; creatureGame.players[0].reserve = 2; creatureGame.players[0].hand.push({ id: "unit", type: "Criatura", cost: 2, atk: 2, hp: 2, tags: [], abilities: [] });
  assert.throws(() => executeCommand(creatureGame, { type: "playCard", owner: 0, cardId: "unit", slot: 0 }), /not-enough-energy/);
});

test("combat damage is simultaneous and turned creatures cannot defend", () => {
  const game = state(); game.phase = "combate"; game.players[0].board.push({ uid: "a", atk: 3, hp: 2, damage: 0, exhausted: false, summoning: false, modifiers: [], tags: [] }); game.players[1].board.push({ uid: "d", atk: 2, hp: 3, damage: 0, exhausted: false, modifiers: [], tags: [] });
  const result = executeCommand(game, { type: "attack", owner: 0, attackerId: "a", defenderId: "d" });
  assert.equal(result.state.players[0].grave.length, 1); assert.equal(result.state.players[1].grave.length, 1);
  const invalid = state(); invalid.phase = "combate"; invalid.players[0].board.push({ uid: "a", atk: 1, hp: 2, exhausted: false, summoning: false, modifiers: [], tags: [] }); invalid.players[1].board.push({ uid: "d", atk: 1, hp: 2, exhausted: true, modifiers: [], tags: [] });
  assert.throws(() => executeCommand(invalid, { type: "attack", owner: 0, attackerId: "a", defenderId: "d" }), /invalid-defender/);
});

test("resolution guard finds infinite trigger loops", () => {
  const game = state(); game.players[0].board.push({ uid: "loop", slot: 0, abilities: [{ id: "again", trigger: "after:draw", effects: [{ type: "draw", amount: 0 }] }] });
  assert.throws(() => executeCommand(game, { type: "emit", event: { type: "after:draw" } }, { maxSteps: 20 }), RulesLoopError);
});

test("catalog audit reports invalid records without crashing", () => {
  const report = auditCards([{ id: "ok", type: "Feitiço", cost: 1, text: "Compre 1 carta." }, { id: "ok", type: "Criatura", cost: -1, text: "" }]);
  assert.ok(report.issues.some((issue) => issue.code === "duplicate-or-missing-id")); assert.ok(report.issues.some((issue) => issue.code === "invalid-cost"));
});

test("headless simulations are deterministic and bounded", () => {
  const createGame = () => state(); const chooseCommand = (game) => game.round > 4 ? null : { type: "advancePhase" };
  const first = runHeadlessGames({ games: 50, seed: 42, createGame, chooseCommand, execute: executeCommand });
  const second = runHeadlessGames({ games: 50, seed: 42, createGame, chooseCommand, execute: executeCommand });
  assert.deepEqual(first, second); assert.equal(first.games, 50);
});


test("the complete generated catalog remains structurally valid and classifiable", async () => {
  const cards = JSON.parse(await readFile(new URL("../app/cards.generated.json", import.meta.url), "utf8"));
  const report = auditCards(cards);
  const errors = report.issues.filter((issue) => issue.severity === "error");
  assert.equal(report.cards, 308);
  assert.deepEqual(errors, []);
  assert.ok(report.coverage >= 0.8, `compiler coverage dropped to ${(report.coverage * 100).toFixed(1)}%`);
});

test("multiplayer API accepts whitelisted rules commands through the authoritative engine", async () => {
  const [route, machine] = await Promise.all([
    readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /body\.action === "command"/);
  assert.match(machine, /AUTHORITATIVE_COMMANDS/);
  assert.match(machine, /executeCommand/);
  assert.match(machine, /rawCommand, owner/);
});

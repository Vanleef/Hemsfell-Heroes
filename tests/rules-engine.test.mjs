import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { auditCards, compileCard, compileCardText } from "../app/rules-engine/compiler.mjs";
import { explicitCardRules, explicitRuleIds } from "../app/rules-engine/card-rules.mjs";
import { defaultEffectHandlers } from "../app/rules-engine/effects.mjs";
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

test("all 65 clarified clauses are represented by 64 explicit card records", () => {
  assert.equal(explicitRuleIds.length, 64);
  assert.ok(Array.isArray(explicitCardRules.p120));
  assert.equal(explicitCardRules.p120.length, 2);
  assert.deepEqual(["p84", "p85", "p93", "p99", "p101", "p178", "p207"].filter((id) => !explicitCardRules[id]?.ignored), []);
});

test("explicit cards compile without unsupported text fallbacks", () => {
  for (const id of explicitRuleIds) {
    const compiled = compileCard({ id, text: "texto legado", level: 3 });
    assert.equal(compiled.diagnostics.unsupported, 0, id);
    assert.equal(compiled.diagnostics.source, "explicit", id);
  }
});

test("every primitive used by the clarified cards has an effect handler", () => {
  const missing = new Set();
  const inspect = (effects = []) => {
    for (const entry of effects) {
      if (!defaultEffectHandlers[entry.type]) missing.add(entry.type);
      inspect(entry.effects);
      for (const branch of entry.branches || []) inspect(branch.effects);
      for (const choice of entry.choices || []) inspect(choice);
    }
  };
  for (const rule of Object.values(explicitCardRules)) {
    const abilities = Array.isArray(rule) ? rule : rule.hero ? Object.values(rule.levels || {}).flat() : [];
    for (const entry of abilities) inspect(entry.effects);
  }
  assert.deepEqual([...missing], []);
});

test("unrestricted damage can target heroes", () => {
  const game = state(); game.players[0].hand.push({ id: "spell", type: "Feitiço", cost: 0, abilities: [{ id: "hit", trigger: "onPlay", effects: [{ type: "damage", amount: 3, target: "anyCharacter" }] }] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "spell", targetIds: ["enemy-hero"] });
  assert.equal(result.state.players[1].life, 27);
});

test("Alerta preserves the attacker ready and Voar requires a flying blocker", () => {
  const alert = state(); alert.phase = "combate"; alert.players[0].board.push({ uid: "a", atk: 2, hp: 2, tags: ["Alerta"], exhausted: false, summoning: false, modifiers: [] });
  assert.equal(executeCommand(alert, { type: "attack", owner: 0, attackerId: "a" }).state.players[0].board[0].exhausted, false);
  const flying = state(); flying.phase = "combate"; flying.players[0].board.push({ uid: "a", atk: 2, hp: 2, tags: ["Voar"], exhausted: false, summoning: false, modifiers: [] }); flying.players[1].board.push({ uid: "d", atk: 1, hp: 3, tags: [], exhausted: false, modifiers: [] });
  assert.throws(() => executeCommand(flying, { type: "attack", owner: 0, attackerId: "a", defenderId: "d" }), /flying-blocker-required/);
});

test("generated Images disappear instead of entering the grave", () => {
  const game = state(); game.players[0].board.push({ uid: "image", id: "image", imageCard: true, generatedImage: true, hp: 1, damage: 0 });
  defaultEffectHandlers.destroy(game, { type: "destroy" }, { owner: 1, targetIds: ["image"] });
  assert.equal(game.players[0].grave.length, 0); assert.equal(game.players[0].board.length, 0);
});

test("destroying a creature also sends its attached artifact to the grave", () => {
  const game = state(); game.players[0].board.push({ uid: "unit", id: "unit" }); game.players[0].support.push({ uid: "artifact", id: "artifact", attachedTo: "unit" });
  defaultEffectHandlers.destroy(game, { type: "destroy" }, { owner: 1, targetIds: ["unit"] });
  assert.deepEqual(game.players[0].grave.map((card) => card.uid).sort(), ["artifact", "unit"]);
});

test("one-use damage shield cancels the entire next damage instance", () => {
  const game = state(); game.players[0].board.push({ uid: "unit", hp: 2, damage: 0, damageShields: [{ uses: 1 }] });
  defaultEffectHandlers.damage(game, { type: "damage", amount: 99 }, { owner: 1, targetIds: ["unit"] });
  assert.equal(game.players[0].board[0].damage, 0); assert.deepEqual(game.players[0].board[0].damageShields, []);
});

test("activated abilities are limited to once per turn", () => {
  const game = state(); const card = compileCard({ id: "p229", text: "", type: "Encanto" }); game.players[0].support.push({ ...card, uid: "machine", exhausted: false, summoning: false });
  const first = executeCommand(game, { type: "activate", owner: 0, sourceId: "machine", abilityId: card.abilities[0].id });
  assert.throws(() => executeCommand(first.state, { type: "activate", owner: 0, sourceId: "machine", abilityId: card.abilities[0].id }), /ability-limit-reached|cannot-tap/);
});

test("Bomba doubles all markers and halves maximum energy with ceiling", () => {
  const game = state(); game.players[0].maxEnergy = 9; game.players[0].energy = 9; game.players[0].board.push({ uid: "one", markers: 2 }, { uid: "two", markers: { action: 3 } });
  defaultEffectHandlers.doubleMarkers(game, {}, { owner: 0 }); defaultEffectHandlers.halveMaxEnergy(game, {}, { owner: 0 });
  assert.equal(game.players[0].board[0].markers, 4); assert.equal(game.players[0].board[1].markers.action, 6); assert.equal(game.players[0].maxEnergy, 5); assert.equal(game.players[0].energy, 5);
});

test("repositioning a creature keeps its artifact attached and aligned", () => {
  const game = state(); game.pendingReposition = { owners: [0, 1], confirmed: [], moveAttachments: true }; game.players[0].board.push({ uid: "unit", slot: 1 }); game.players[0].support.push({ uid: "artifact", slot: 1, attachedTo: "unit" });
  const moved = executeCommand(game, { type: "reposition", owner: 0, moves: [{ sourceId: "unit", slot: 4 }] }).state;
  assert.equal(moved.players[0].board[0].slot, 4); assert.equal(moved.players[0].support[0].slot, 4);
  const hostDone = executeCommand(moved, { type: "confirmReposition", owner: 0 }).state; assert.ok(hostDone.pendingReposition);
  const allDone = executeCommand(hostDone, { type: "confirmReposition", owner: 1 }).state; assert.equal(allDone.pendingReposition, null);
});

test("the complete generated catalog has full classified coverage", async () => {
  const cards = JSON.parse(await readFile(new URL("../app/cards.generated.json", import.meta.url), "utf8"));
  const report = auditCards(cards);
  const errors = report.issues.filter((issue) => issue.severity === "error");
  assert.equal(report.cards, 308);
  assert.deepEqual(errors, []);
  assert.equal(report.unsupported, 0);
  assert.equal(report.coverage, 1);
});

test("multiplayer API exposes the authoritative command path", async () => {
  const [route, machine] = await Promise.all([
    readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /body\.action === "command"/);
  assert.match(machine, /AUTHORITATIVE_COMMANDS/);
  assert.match(machine, /executeCommand/);
});

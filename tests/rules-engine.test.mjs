import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { auditCards, compileCard, compileCardText } from "../app/rules-engine/compiler.mjs";
import { explicitCardRules, explicitRuleIds } from "../app/rules-engine/card-rules.mjs";
import { defaultEffectHandlers } from "../app/rules-engine/effects.mjs";
import { hasSubtype, subtypesFor } from "../app/rules-engine/subtypes.mjs";
import { isValidTarget, targetPolicy, TargetScope } from "../app/rules-engine/targeting.mjs";
import { canExecuteCard, executeCommand, RulesLoopError } from "../app/rules-engine/engine.mjs";
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

test("combat keywords alter actual rule resolution", () => {
  const fast = state(); fast.phase = "combate";
  fast.players[0].board.push({ uid: "fast", atk: 2, hp: 1, tags: ["Veloz"], exhausted: false, summoning: false, modifiers: [] });
  fast.players[1].board.push({ uid: "slow", atk: 5, hp: 2, tags: [], exhausted: false, summoning: false, modifiers: [] });
  const fastResult = executeCommand(fast, { type: "attack", owner: 0, attackerId: "fast", defenderId: "slow" });
  assert.equal(fastResult.state.players[0].board.length, 1);
  assert.equal(fastResult.state.players[1].board.length, 0);

  const trample = state(); trample.phase = "combate";
  trample.players[0].board.push({ uid: "tram", atk: 5, hp: 5, tags: ["Atropelar"], exhausted: false, summoning: false, modifiers: [] });
  trample.players[1].board.push({ uid: "block", atk: 0, hp: 2, tags: ["Robusto"], exhausted: false, summoning: false, modifiers: [] });
  const trampleResult = executeCommand(trample, { type: "attack", owner: 0, attackerId: "tram", defenderId: "block" });
  assert.equal(trampleResult.state.players[1].life, 28);
});

test("Furtivo cannot be blocked and Roubo de Vida heals applied damage", () => {
  const stealth = state(); stealth.phase = "combate";
  stealth.players[0].life = 10;
  stealth.players[0].board.push({ uid: "stealth", atk: 3, hp: 3, tags: ["Furtivo", "Roubo de Vida"], exhausted: false, summoning: false, modifiers: [] });
  stealth.players[1].board.push({ uid: "blocker", atk: 1, hp: 3, tags: [], exhausted: false, summoning: false, modifiers: [] });
  assert.throws(() => executeCommand(stealth, { type: "attack", owner: 0, attackerId: "stealth", defenderId: "blocker" }), /unblockable-attacker/);
  const direct = executeCommand(stealth, { type: "attack", owner: 0, attackerId: "stealth" });
  assert.equal(direct.state.players[0].life, 13);
  assert.equal(direct.state.players[1].life, 27);
});

test("Images never trigger Last Breath when destroyed", () => {
  const game = state(); game.phase = "combate"; game.players[1].deck.push({ id: "forbidden-draw" });
  game.players[0].board.push({ uid: "attacker", atk: 3, hp: 3, tags: [], exhausted: false, summoning: false, modifiers: [] });
  game.players[1].board.push({ uid: "image", atk: 0, hp: 1, tags: ["Último Suspiro"], imageCard: true, generatedImage: true, exhausted: false, summoning: false, modifiers: [], abilities: [{ id: "last", trigger: "onDestroyed", effects: [{ type: "draw", amount: 1 }] }] });
  const result = executeCommand(game, { type: "attack", owner: 0, attackerId: "attacker", defenderId: "image" });
  assert.equal(result.state.players[1].hand.length, 0);
  assert.equal(result.state.players[1].grave.length, 0);
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

test("all clarified clauses are represented by explicit card records", () => {
  assert.equal(explicitRuleIds.length, 77);
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

test("keyword effects register the printed keyword instead of undefined", () => {
  const game = state(); game.players[0].board.push({ uid: "unit", id: "unit", tags: [], abilities: [] });
  defaultEffectHandlers.keyword(game, { type: "keyword", raw: "Voar" }, { owner: 0, sourceId: "unit" });
  assert.deepEqual(game.players[0].board[0].tags, ["Voar"]);
});

test("Terremoto damages creatures based on enemy creature count and ignores support cards", () => {
  const earthquake = compileCard({ id: "p58", page: 58, type: "Feitiço", cost: 0, text: "Terremoto" });
  assert.equal(earthquake.abilities[0].effects[0].amountPerEnemyCreature, 1);
  const game = state(); game.players[0].hand.push(earthquake); game.players[0].board.push({ uid: "ally", hp: 5, damage: 0 }); game.players[0].support.push({ uid: "support", hp: 5, damage: 0 }); game.players[1].board.push({ uid: "enemy-1", hp: 5, damage: 0 }, { uid: "enemy-2", hp: 5, damage: 0 });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p58" });
  assert.equal(result.state.players[0].board[0].damage, 2);
  assert.equal(result.state.players[1].board[0].damage, 2);
  assert.equal(result.state.players[0].support[0].damage, 0);
});

test("Alerta preserves the attacker ready and Voar requires a flying blocker", () => {
  const alert = state(); alert.phase = "combate"; alert.players[0].board.push({ uid: "a", atk: 2, hp: 2, tags: ["Alerta"], exhausted: false, summoning: false, modifiers: [] });
  const alertResult = executeCommand(alert, { type: "attack", owner: 0, attackerId: "a" }).state;
  assert.equal(alertResult.players[0].board[0].exhausted, false);
  assert.equal(alertResult.players[0].board[0].attackedThisTurn, true);
  assert.throws(() => executeCommand(alertResult, { type: "attack", owner: 0, attackerId: "a" }), /invalid-attacker/);
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

test("playing an Artifact binds it to the creature without treating the host as an effect target", () => {
  const game = state(); game.players[0].board.push({ uid: "host", id: "host", slot: 2, hp: 3, damage: 0 });
  game.players[0].hand.push({ id: "artifact", name: "Test Artifact", type: "Artefato", cost: 1, tags: [], text: "", abilities: [] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "artifact", attachedTo: "host", slot: 2, targetIds: [] });
  assert.equal(result.state.players[0].hand.length, 0);
  assert.equal(result.state.players[0].support[0].attachedTo, "host");
  assert.equal(result.state.players[0].support[0].slot, 2);
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

test("subtypes are card data and support cards with more than one subtype", () => {
  assert.equal(hasSubtype({ page: 24 }, "Dragão"), true);
  assert.equal(hasSubtype({ page: 216 }, "Dragão"), true);
  assert.equal(hasSubtype({ page: 216 }, "Gato"), true);
  assert.deepEqual(subtypesFor({ page: 216 }).sort(), ["Dragão", "Gato"]);
  assert.equal(hasSubtype({ page: 183 }, "Recruta"), true);
});

test("target policy follows creature, controller and global delimiters", () => {
  assert.deepEqual((({ scope, selections }) => ({ scope, selections }))(targetPolicy("Cause 2 de dano a uma criatura.")), { scope: TargetScope.ANY_CREATURE, selections: 1 });
  assert.deepEqual((({ scope, selections }) => ({ scope, selections }))(targetPolicy("Cause 1 de dano a 2 criaturas.")), { scope: TargetScope.ANY_CREATURE, selections: 2 });
  assert.deepEqual((({ scope, selections, global }) => ({ scope, selections, global }))(targetPolicy("Cause 2 de dano a todas as criaturas inimigas.")), { scope: TargetScope.NONE, selections: 0, global: true });
  assert.equal(targetPolicy("Cause 2 de dano a um alvo.").scope, TargetScope.ANY_CHARACTER);
  assert.equal(targetPolicy("Cure 2 de vida.").scope, TargetScope.ANY_CHARACTER);
  assert.equal(targetPolicy("Cure 2 de vida de uma criatura aliada.").scope, TargetScope.ALLY_CREATURE);
});

test("target validation permits heroes only when creature is not required", () => {
  assert.equal(isValidTarget(targetPolicy("Cause 2 de dano a um alvo."), 0, 1, "hero"), true);
  assert.equal(isValidTarget(targetPolicy("Cause 2 de dano a uma criatura."), 0, 1, "hero"), false);
  assert.equal(isValidTarget(targetPolicy("Cause 2 de dano a uma criatura."), 0, 0, "creature"), true);
  assert.equal(isValidTarget(targetPolicy("Cause 2 de dano a uma criatura inimiga."), 0, 0, "creature"), false);
});

test("sacrifice spell exposes ordered cost and effect target steps", () => {
  const policy = targetPolicy({ type: "Feitiço", text: "Sacrifique uma criatura aliada. Cause 2 de dano a uma criatura." });
  assert.equal(policy.selections, 2);
  assert.deepEqual(policy.steps.map((step) => [step.role, step.scope]), [
    ["sacrifice", TargetScope.ALLY_CREATURE],
    ["effect", TargetScope.ANY_CREATURE],
  ]);
});

test("spell sacrifice is an on-play cost and is paid atomically", () => {
  const spell = compileCard({ id: "offering", type: "Feitiço", cost: 2, tags: [], text: "Sacrifique uma criatura aliada. Compre 1 carta." });
  assert.equal(spell.abilities[0].trigger, "onPlay");
  assert.equal(spell.abilities[0].costs[0].type, "sacrifice");
  const invalid = state(); invalid.players[0].hand.push(spell); invalid.players[0].deck.push({ id: "drawn" });
  assert.throws(() => executeCommand(invalid, { type: "playCard", owner: 0, cardId: "offering" }), /sacrifice-required/);
  assert.equal(invalid.players[0].energy, 5); assert.equal(invalid.players[0].hand.length, 1);
  const valid = state(); valid.players[0].hand.push(spell); valid.players[0].deck.push({ id: "drawn" }); valid.players[0].board.push({ uid: "tribute", id: "tribute" });
  const result = executeCommand(valid, { type: "playCard", owner: 0, cardId: "offering", sacrificeIds: ["tribute"] });
  assert.equal(result.state.players[0].energy, 3); assert.equal(result.state.players[0].hand[0].id, "drawn");
});

test("server engine validates target scope and resolves every damage instance", () => {
  const game = state(); game.players[0].hand.push({ id: "split", type: "Feitiço", cost: 0, tags: [], abilities: [{ id: "split-hit", trigger: "onPlay", effects: [{ type: "damage", amount: 1, target: "anyCreature", selections: 2 }] }] });
  game.players[0].board.push({ uid: "ally", hp: 3, damage: 0 }); game.players[1].board.push({ uid: "enemy", hp: 3, damage: 0 });
  assert.throws(() => executeCommand(game, { type: "playCard", owner: 0, cardId: "split", targetIds: ["enemy-hero", "enemy"] }), /invalid-target/);
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "split", targetIds: ["ally", "enemy"] });
  assert.equal(result.state.players[0].board[0].damage, 1); assert.equal(result.state.players[1].board[0].damage, 1);
});

test("server engine enforces Magic Barrier", () => {
  const game = state(); game.players[0].hand.push({ id: "bolt", type: "Feitiço", cost: 0, tags: [], text: "Cause 1 de dano a uma criatura.", abilities: [{ id: "hit", trigger: "onPlay", sourceText: "Cause 1 de dano a uma criatura.", effects: [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }] }] });
  game.players[1].board.push({ uid: "warded", hp: 3, damage: 0, tags: ["Barreira Mágica"] });
  assert.throws(() => executeCommand(game, { type: "playCard", owner: 0, cardId: "bolt", targetIds: ["warded"] }), /magic-barrier/);
});

test("Last Breath resolves from the destroyed card after it leaves the field", () => {
  const game = state(); game.players[1].deck.push({ id: "reward" }); game.players[1].board.push({ uid: "victim", id: "victim", hp: 1, damage: 0, tags: ["Último Suspiro"], abilities: [{ id: "last", trigger: "onDestroyed", effects: [{ type: "draw", amount: 1 }] }] });
  game.players[0].hand.push({ id: "bolt", type: "Feitiço", cost: 0, tags: [], abilities: [{ id: "hit", trigger: "onPlay", effects: [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }] }] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "bolt", targetIds: ["victim"] });
  assert.equal(result.state.players[1].hand[0].id, "reward");
});

test("passive spell-cast triggers resolve from modular abilities", () => {
  const game = state(); game.players[0].board.push({ uid: "listener", slot: 0, abilities: [{ id: "listen", trigger: "onSpellCast", effects: [{ type: "draw", amount: 1 }], usageLimit: { count: 1, period: "turn" } }] });
  game.players[0].hand.push({ id: "spell", type: "Feitiço", cost: 0, tags: [], abilities: [] }); game.players[0].deck.push({ id: "drawn" });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "spell" });
  assert.equal(result.state.players[0].hand[0].id, "drawn");
});

test("Quarion simple effects resolve with their card-specific restrictions", () => {
  const target = { uid: "target", id: "target", name: "Recruta Elegante", hp: 5, damage: 0, exhausted: true, cost: 2, tags: ["Recruta"] };
  const game = state(); game.players[0].board.push(target); game.players[0].hand.push(compileCard({ id: "p188", page: 188, type: "Criatura", cost: 1, text: "" }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p188", targetIds: ["target"] });
  assert.equal(result.state.players[0].board.find((unit) => unit.uid === "target").damage, 2);
  const recruit = state(); recruit.players[0].board.push({ ...target, exhausted: false }); recruit.players[0].hand.push(compileCard({ id: "p190", page: 190, type: "Criatura", cost: 1, text: "" }));
  assert.throws(() => executeCommand(recruit, { type: "playCard", owner: 0, cardId: "p190", targetIds: ["target"] }), /target-must-be-exhausted/);
});

test("Quarion artifacts modify their connected creature", () => {
  const game = state(); game.players[0].board.push({ uid: "host", id: "host", hp: 4, damage: 0 });
  game.players[0].hand.push(compileCard({ id: "p193", page: 193, type: "Artefato", cost: 1, text: "" }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p193", attachedTo: "host", slot: 0 });
  assert.deepEqual(result.state.players[0].board[0].modifiers[0], { attack: 3, health: 2, duration: "permanent" });
  assert.deepEqual(result.state.players[0].support[0].modifiers, []);
});

test("Quarion healing counts turned creatures", () => {
  const game = state(); game.players[0].life = 10; game.players[0].board.push({ uid: "a", exhausted: true }, { uid: "b", exhausted: true }, { uid: "c", exhausted: false });
  game.players[0].hand.push(compileCard({ id: "p202", page: 202, type: "Feitiço", cost: 1, text: "" }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p202" });
  assert.equal(result.state.players[0].life, 14);
});

test("Quarion Recruit terrains are passive and do not request play targets", () => {
  for (const id of ["p181", "p182"]) {
    const card = compileCard({ id, page: Number(id.slice(1)), type: id === "p181" ? "Terreno" : "Criatura", cost: 1, text: "" });
    assert.equal(canExecuteCard(card), true);
    assert.deepEqual(card.abilities.flatMap((ability) => ability.effects).map((effect) => effect.type), [id === "p181" ? "recruitFirstActOnLeave" : "doubleRecruitFirstAct"]);
  }
});

test("First Act creatures enter even when no target is available", () => {
  const game = state(); game.players[0].hand.push(compileCard({ id: "p6", page: 6, type: "Criatura", cost: 1, text: "" }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p6", slot: 0 });
  assert.equal(result.state.players[0].board.length, 1);
});

test("Mask of the Pact is the independent artifact exception", () => {
  const game = state(); game.players[0].hand.push(compileCard({ id: "p304", page: 304, type: "Artefato", cost: 0, text: "" }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p304", slot: 0 });
  assert.equal(result.state.players[0].support.length, 1);
  assert.equal(result.state.players[0].support[0].attachedTo, undefined);
});

test("Defensor X can block X separate attackers before becoming unavailable", () => {
  const game = state(); game.phase = "combate";
  game.players[0].board.push(
    { uid: "a1", atk: 1, hp: 3, tags: [], exhausted: false, summoning: false, modifiers: [] },
    { uid: "a2", atk: 1, hp: 3, tags: [], exhausted: false, summoning: false, modifiers: [] },
    { uid: "a3", atk: 1, hp: 3, tags: [], exhausted: false, summoning: false, modifiers: [] },
  );
  game.players[1].board.push({ uid: "wall", atk: 0, hp: 5, tags: ["Defensor 2"], exhausted: false, defenseUses: 0, modifiers: [] });
  const first = executeCommand(game, { type: "attack", owner: 0, attackerId: "a1", defenderId: "wall" }).state;
  assert.equal(first.players[1].board[0].exhausted, false);
  const second = executeCommand(first, { type: "attack", owner: 0, attackerId: "a2", defenderId: "wall" }).state;
  assert.equal(second.players[1].board[0].defenseUses, 2);
  assert.equal(second.players[1].board[0].exhausted, true);
  assert.throws(() => executeCommand(second, { type: "attack", owner: 0, attackerId: "a3", defenderId: "wall" }), /invalid-defender/);
});

test("Indomável prevents leaving combat while an eligible creature has not attacked", () => {
  const game = state(); game.phase = "combate";
  game.players[0].board.push({ uid: "must", atk: 1, hp: 2, tags: ["Indomável"], exhausted: false, summoning: false, modifiers: [] });
  assert.throws(() => executeCommand(game, { type: "advancePhase" }), /indomitable-must-attack/);
  const attacked = executeCommand(game, { type: "attack", owner: 0, attackerId: "must" }).state;
  assert.equal(executeCommand(attacked, { type: "advancePhase" }).state.phase, "fim");

  const vigilant = state(); vigilant.phase = "combate";
  vigilant.players[0].board.push({ uid: "vigilant", atk: 1, hp: 2, tags: ["Indomável", "Alerta"], exhausted: false, summoning: false, modifiers: [] });
  const vigilantAttack = executeCommand(vigilant, { type: "attack", owner: 0, attackerId: "vigilant" }).state;
  assert.equal(vigilantAttack.players[0].board[0].exhausted, false);
  assert.equal(executeCommand(vigilantAttack, { type: "advancePhase" }).state.phase, "fim");
});

test("tap costs cannot be paid in the same turn a constant entered", () => {
  const game = state();
  game.players[0].hand.push({ id: "relic", type: "Encanto", cost: 0, tags: [], abilities: [{ id: "tap", trigger: "activated", usageLimit: { count: 1, period: "turn" }, costs: [{ type: "tap" }], effects: [{ type: "draw", amount: 0 }] }] });
  const played = executeCommand(game, { type: "playCard", owner: 0, cardId: "relic", slot: 0 }).state;
  const relic = played.players[0].support[0];
  assert.throws(() => executeCommand(played, { type: "activate", owner: 0, sourceId: relic.uid, abilityId: "tap" }), /cannot-tap/);
});

test("turn-duration effects expire before the opponent starts maintenance", () => {
  const game = state(); game.phase = "fim";
  game.players[0].board.push({ uid: "buffed", modifiers: [{ attack: 2, health: 2, duration: "turn" }], abilities: [{ id: "temporary", temporary: true, trigger: "onSpellCast", effects: [] }] });
  const result = executeCommand(game, { type: "advancePhase" }).state;
  assert.equal(result.active, 1);
  assert.deepEqual(result.players[0].board[0].modifiers, []);
  assert.deepEqual(result.players[0].board[0].abilities, []);
});

test("controller-turn discounts do not reduce accelerated responses on the opponent turn", () => {
  const ownTurn = state(); ownTurn.players[0].energy = 1;
  ownTurn.players[0].support.push({ uid: "discount", staticModifiers: [{ type: "costModifier", selector: { type: "Feitiço" }, amount: -1, during: "controllerTurn" }] });
  ownTurn.players[0].hand.push({ id: "spell", type: "Feitiço", cost: 2, tags: ["Acelerado"], abilities: [] });
  assert.equal(executeCommand(ownTurn, { type: "playCard", owner: 0, cardId: "spell" }).state.players[0].energy, 0);

  const response = state(); response.active = 1; response.players[0].energy = 1;
  response.players[0].support.push({ uid: "discount", staticModifiers: [{ type: "costModifier", selector: { type: "Feitiço" }, amount: -1, during: "controllerTurn" }] });
  response.players[0].hand.push({ id: "spell", type: "Feitiço", cost: 2, tags: ["Acelerado"], abilities: [] });
  assert.throws(() => executeCommand(response, { type: "playCard", owner: 0, cardId: "spell", hasPriority: true }), /not-enough-energy/);
});

test("permanent targeting includes Terrains but creature targeting excludes support cards", () => {
  assert.equal(targetPolicy("Destrua uma constante inimiga.").scope, TargetScope.ENEMY_PERMANENT);
  assert.equal(targetPolicy("Destrua uma criatura inimiga.").scope, TargetScope.ENEMY_CREATURE);
  assert.equal(isValidTarget(targetPolicy("Destrua uma constante inimiga."), 0, 1, "permanent"), true);
  assert.equal(isValidTarget(targetPolicy("Destrua uma criatura inimiga."), 0, 1, "permanent"), false);

  const game = state();
  game.players[0].hand.push({ id: "creature-hit", type: "Feitiço", cost: 0, text: "", tags: [], abilities: [{ id: "hit", trigger: "onPlay", effects: [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }] }] });
  game.players[1].support.push({ uid: "artifact", id: "artifact", type: "Artefato", hp: 3, damage: 0 });
  assert.throws(() => executeCommand(game, { type: "playCard", owner: 0, cardId: "creature-hit", targetIds: ["artifact"] }), /invalid-target/);
});

test("Terrains can be destroyed and Indestructible permanents resist destruction", () => {
  const terrainGame = state();
  terrainGame.players[1].terrain = { uid: "terrain", id: "terrain", type: "Terreno", tags: [] };
  defaultEffectHandlers.destroy(terrainGame, { type: "destroy" }, { owner: 0, targetIds: ["terrain"] });
  assert.equal(terrainGame.players[1].terrain, null);
  assert.equal(terrainGame.players[1].grave[0].uid, "terrain");

  const protectedGame = state();
  protectedGame.players[1].board.push({ uid: "protected", id: "protected", type: "Criatura", tags: ["Indestrutível"] });
  defaultEffectHandlers.destroy(protectedGame, { type: "destroy" }, { owner: 0, targetIds: ["protected"] });
  assert.equal(protectedGame.players[1].board.length, 1);
  assert.equal(protectedGame.players[1].grave.length, 0);
});

test("created creature Images enter the creature zone and resolve First Act", () => {
  const game = state();
  game.players[0].extraDeck = [{ id: "image", name: "Imagem de Teste", type: "Criatura", atk: 1, hp: 1, tags: ["Primeiro Ato"], abilities: [{ id: "image-etb", trigger: "onEnter", effects: [{ type: "draw", amount: 1 }] }] }];
  game.players[0].deck.push({ id: "reward" });
  game.players[0].hand.push({ id: "summon", type: "Feitiço", cost: 0, tags: [], abilities: [{ id: "summon-image", trigger: "onPlay", effects: [{ type: "createImage", name: "Imagem de Teste", destination: "field" }] }] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "summon" }).state;
  assert.equal(result.players[0].board.length, 1);
  assert.equal(result.players[0].board[0].imageCard, true);
  assert.equal(result.players[0].hand[0].id, "reward");
});

test("snapshot subtype bonuses use canonical subtype data instead of loose text tags", () => {
  const game = state();
  game.players[0].board.push({ uid: "source", id: "p185", page: 185, type: "Criatura", atk: 1, hp: 1, tags: [], modifiers: [] });
  game.players[0].board.push({ uid: "recruit", id: "p183", page: 183, type: "Criatura", atk: 1, hp: 1, tags: [], modifiers: [] });
  defaultEffectHandlers.snapshotStats(game, { type: "snapshotStats", attackPerOtherSubtype: { subtype: "Recruta", amount: 1 } }, { owner: 0, sourceId: "source" });
  assert.equal(game.players[0].board[0].modifiers[0].attack, 1);
});

test("generated Image artifacts disappear when their linked creature leaves", () => {
  const game = state();
  game.players[0].board.push({ uid: "host", id: "host", type: "Criatura" });
  game.players[0].support.push({ uid: "image-artifact", id: "image-artifact", type: "Artefato", attachedTo: "host", generatedImage: true, imageCard: true });
  defaultEffectHandlers.returnToHand(game, { type: "returnToHand" }, { owner: 1, targetIds: ["host"] });
  assert.equal(game.players[0].support.length, 0);
  assert.equal(game.players[0].grave.length, 0);
  assert.equal(game.players[0].hand[0].uid, "host");
});

test("damage triggers apply only to the creature that actually survived damage", () => {
  const game = state(); game.active = 1;
  const reactive = compileCard({ id: "p165", page: 165, type: "Criatura", atk: 1, hp: 4, text: "" });
  game.players[0].board.push({ ...reactive, uid: "hit", damage: 0, exhausted: false, summoning: false, modifiers: [] }, { ...reactive, uid: "untouched", damage: 0, exhausted: false, summoning: false, modifiers: [] });
  game.players[1].hand.push({ id: "ping", type: "Feitiço", cost: 0, tags: [], abilities: [{ id: "damage", trigger: "onPlay", effects: [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }] }] });
  const result = executeCommand(game, { type: "playCard", owner: 1, cardId: "ping", targetIds: ["hit"] }).state;
  assert.equal(result.players[0].board.find((unit) => unit.uid === "hit").modifiers[0].attack, 1);
  assert.deepEqual(result.players[0].board.find((unit) => unit.uid === "untouched").modifiers, []);
});

test("an attached damage trigger observes only damage from its linked creature", () => {
  const game = state(); game.phase = "combate";
  game.players[0].board.push({ uid: "host", type: "Criatura", atk: 2, hp: 3, tags: [], exhausted: false, summoning: false, modifiers: [] });
  game.players[0].support.push({ uid: "dagger", type: "Artefato", attachedTo: "host", abilities: [{ id: "blood-price", trigger: "onAttachedCreatureDamage", effects: [{ type: "loseLife", amount: 1, target: "controllerHero" }] }] });
  const result = executeCommand(game, { type: "attack", owner: 0, attackerId: "host" }).state;
  assert.equal(result.players[0].life, 29);
});

test("attack permissions validate and on-attack costs are resolved", () => {
  const blocked = state(); blocked.phase = "combate";
  blocked.players[0].board.push({ uid: "goblin", type: "Criatura", atk: 5, hp: 4, tags: ["Alerta"], markers: { action: 1 }, attackPermission: { requiresMarkers: { marker: "action", minimum: 2 } }, exhausted: false, summoning: false, modifiers: [], abilities: [{ id: "spend", trigger: "onAttack", effects: [{ type: "removeMarker", marker: "action", amount: 2 }] }] });
  assert.throws(() => executeCommand(blocked, { type: "attack", owner: 0, attackerId: "goblin" }), /attack-requirement-not-met/);
  blocked.players[0].board[0].markers.action = 2;
  const result = executeCommand(blocked, { type: "attack", owner: 0, attackerId: "goblin" }).state;
  assert.equal(result.players[0].board[0].markers.action, 0);
});

test("combat-kill triggers resolve only when the attacker survives", () => {
  const game = state(); game.phase = "combate";
  game.players[0].grave.push({ id: "one-drop", type: "Criatura", cost: 1, atk: 1, hp: 1, tags: [], abilities: [] });
  game.players[0].board.push({ uid: "primordial", type: "Criatura", atk: 3, hp: 3, tags: [], exhausted: false, summoning: false, modifiers: [], abilities: [{ id: "recover", trigger: "onCombatKill", effects: [{ type: "resurrect", cardType: "Criatura", cost: 1, optional: true }] }] });
  game.players[1].board.push({ uid: "victim", type: "Criatura", atk: 1, hp: 2, tags: [], exhausted: false, summoning: false, modifiers: [] });
  const result = executeCommand(game, { type: "attack", owner: 0, attackerId: "primordial", defenderId: "victim" }).state;
  assert.ok(result.players[0].board.some((unit) => unit.id === "one-drop"));
});

test("spell-cast listeners trigger only for their controller's spell", () => {
  const game = state();
  game.players[0].board.push({ uid: "listener-a", abilities: [{ id: "a", trigger: "onSpellCast", effects: [{ type: "draw", amount: 1 }] }] });
  game.players[1].board.push({ uid: "listener-b", abilities: [{ id: "b", trigger: "onSpellCast", effects: [{ type: "draw", amount: 1 }] }] });
  game.players[0].deck.push({ id: "reward-a" }); game.players[1].deck.push({ id: "reward-b" });
  game.players[0].hand.push({ id: "spell", type: "Feitiço", cost: 0, tags: [], abilities: [] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "spell" }).state;
  assert.equal(result.players[0].hand[0].id, "reward-a");
  assert.equal(result.players[1].hand.length, 0);
});

test("play and activation availability conditions are authoritative", () => {
  const game = state();
  game.players[0].hand.push({ id: "conditional", type: "Feitiço", cost: 0, tags: [], abilities: [{ id: "conditional-play", trigger: "onPlay", playCondition: { alliedPermanentHasTrigger: "onEnter" }, effects: [{ type: "draw", amount: 0 }] }] });
  assert.throws(() => executeCommand(game, { type: "playCard", owner: 0, cardId: "conditional" }), /play-condition-not-met/);

  const activation = state();
  activation.players[0].board.push({ uid: "source", abilities: [{ id: "top-last-breath", trigger: "activated", availability: { topGraveHasTrigger: "onDestroyed" }, costs: [], effects: [{ type: "draw", amount: 0 }] }] });
  assert.throws(() => executeCommand(activation, { type: "activate", owner: 0, sourceId: "source", abilityId: "top-last-breath" }), /ability-not-available/);
});

test("opponent choices pause resolution and apply the selected branch to the correct player", () => {
  const drawGame = state();
  drawGame.players[0].hand.push(compileCard({ id: "p265", page: 265, type: "Feitiço", cost: 0, text: "" }));
  drawGame.players[0].deck.push({ id: "draw-a" }, { id: "draw-b" });
  drawGame.players[1].deck.push({ id: "mill-a" }, { id: "mill-b" });
  const pendingDraw = executeCommand(drawGame, { type: "playCard", owner: 0, cardId: "p265" }).state;
  assert.equal(pendingDraw.pendingDecision.owner, 1);
  const drew = executeCommand(pendingDraw, { type: "resolveDecision", owner: 1, choiceIndex: 0 }).state;
  assert.deepEqual(drew.players[0].hand.map((card) => card.id), ["draw-a", "draw-b"]);
  assert.equal(drew.pendingDecision, null);

  const millGame = state();
  millGame.players[0].hand.push(compileCard({ id: "p265", page: 265, type: "Feitiço", cost: 0, text: "" }));
  millGame.players[1].deck.push({ id: "mill-a" }, { id: "mill-b" });
  const pendingMill = executeCommand(millGame, { type: "playCard", owner: 0, cardId: "p265" }).state;
  const milled = executeCommand(pendingMill, { type: "resolveDecision", owner: 1, choiceIndex: 1 }).state;
  assert.deepEqual(milled.players[1].grave.map((card) => card.id), ["mill-a", "mill-b"]);
});

test("controller choices can affect both players without leaking decision ownership", () => {
  const game = state();
  const strategist = compileCard({ id: "p174", page: 174, type: "Criatura", text: "" });
  game.players[0].board.push({ ...strategist, uid: "strategist", slot: 0 });
  game.players[0].deck.push({ id: "ally-top" }); game.players[1].deck.push({ id: "enemy-top" });
  const pending = executeCommand(game, { type: "emit", event: { type: "onCombatStart", owner: 0 } }).state;
  assert.equal(pending.pendingDecision.owner, 0);
  const result = executeCommand(pending, { type: "resolveDecision", owner: 0, choiceIndex: 0 }).state;
  assert.equal(result.players[0].hand[0].id, "ally-top");
  assert.equal(result.players[1].hand[0].id, "enemy-top");
});

test("Ilusão Dracônica Menor creates a reusable Dragão Filhote image", () => {
  const game = state();
  game.players[0].hand.push(compileCard({ id: "p12", page: 12, name: "Ilusão Dracônica Menor", type: "Feitiço", cost: 0, text: "" }));
  game.players[0].extraDeck = [{ id: "dragon-token", name: "Dragão Filhote", type: "Criatura", atk: 2, hp: 2, tags: ["Voar"], abilities: [] }];
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p12" }).state;
  assert.equal(result.players[0].board[0].name, "Dragão Filhote");
  assert.equal(result.players[0].board[0].generatedImage, true);
  assert.equal(result.players[0].extraDeck.length, 1);
});

test("Indomável enters ready, must attack and cannot defend", () => {
  const game = state();
  game.players[0].hand.push(compileCard({ id: "p115", page: 115, name: "Indomável", type: "Criatura", cost: 0, atk: 3, hp: 1, text: "", tags: [] }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p115", slot: 0 }).state;
  assert.equal(result.players[0].board[0].summoning, false);
  assert.equal(result.players[0].board[0].cannotDefend, true);
  assert.ok(result.players[0].board[0].tags.includes("Indomável"));
});

test("migration coverage is explicit and simple cards use the command engine", async () => {
  const cards = JSON.parse(await readFile(new URL("../app/cards.generated.json", import.meta.url), "utf8")).map(compileCard);
  const migrated = cards.filter((card) => canExecuteCard(card));
  const pending = cards.filter((card) => !canExecuteCard(card));
  assert.equal(migrated.length, 217); assert.equal(pending.length, 91);
  assert.ok(migrated.every((card) => card.abilities.every((ability) => ability.effects.every((effect) => effect.type !== "unsupported"))));
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

test("actions open a two-pass response window", () => {
  const game = state();
  game.players[0].hand.push({ id: "spell", type: "Feitiço", cost: 0, tags: [], abilities: [] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "spell" });
  assert.equal(result.state.pendingResponse.passes, 0);
  assert.equal(result.state.pendingResponse.responder, 1);
});

test("priority defers the original action until both players pass", () => {
  const game = state(); game.players[0].hand.push({ id: "slow", type: "Feitiço", cost: 0, tags: [], abilities: [] });
  let result = executeCommand(game, { type: "playCard", owner: 0, cardId: "slow" }, { priority: true });
  assert.equal(result.state.players[0].hand.length, 1);
  assert.equal(result.state.pendingAction.type, "playCard");
  result = executeCommand(result.state, { type: "passPriority", owner: 1 }, { priority: true });
  assert.equal(result.state.pendingResponse.responder, 0);
  result = executeCommand(result.state, { type: "passPriority", owner: 0 }, { priority: true });
  assert.equal(result.state.players[0].hand.length, 0);
  assert.equal(result.state.pendingAction, undefined);
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

test("game client routes migrated cards through the command engine", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /canExecuteCard\(snapshot\)/);
  assert.match(page, /roomAction\("command"/);
  assert.match(page, /executeCommand\(current,\{\.\.\.command,owner\},\{priority:true\}\)/);
  assert.match(page, /role!=="attachment"/);
  assert.match(page, /dragged!\.type!=="Artefato"\|\|!!creature/);
});

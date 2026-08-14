import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { auditCards, compileCard, compileCardText } from "../app/rules-engine/compiler.mjs";
import { explicitCardRules, explicitRuleIds } from "../app/rules-engine/card-rules.mjs";
import { defaultEffectHandlers } from "../app/rules-engine/effects.mjs";
import { hasSubtype, subtypesFor } from "../app/rules-engine/subtypes.mjs";
import { cardPlayTargetPolicy, isValidTarget, targetPolicy, TargetScope } from "../app/rules-engine/targeting.mjs";
import { canExecuteCard, executeCommand, RulesLoopError } from "../app/rules-engine/engine.mjs";
import { runHeadlessGames } from "../app/rules-engine/simulator.mjs";
import { PriorityState, chooseAIResponse, isAccelerated, legalPriorityResponses, priorityView, shouldAutoPass } from "../app/rules-engine/priority.mjs";
import { aiDifficultyProfile, canAIPlayLifeCost, legalAIAttackers, orderAIAttackers, preferredAISlot } from "../app/rules-engine/ai.mjs";
import { canActivateCard } from "../app/card-activation.mjs";

const state = () => ({ active: 0, phase: "principal", round: 1, players: [0, 1].map(() => ({ life: 30, maxLife: 30, energy: 5, maxEnergy: 5, reserve: 0, deck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [] })) });

test("ending a turn banks at most three energy and clears main energy", () => {
  const game = state(); game.phase = "fim"; game.players[0].energy = 5; game.players[0].reserve = 1;
  const result = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.deepEqual([result.players[0].energy, result.players[0].reserve, result.active, result.phase], [0, 3, 1, "manutencao"]);

  const blocked = state(); blocked.phase = "fim"; blocked.players[0].energy = 2; blocked.players[0].reserve = 1; blocked.players[0].noReserveStorageThisTurn = true;
  const withoutStorage = executeCommand(blocked, { type: "advancePhase", owner: 0 }).state;
  assert.deepEqual([withoutStorage.players[0].energy, withoutStorage.players[0].reserve], [0, 1]);
});

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

test("reserve energy pays every non-creature card but never creatures", () => {
  for (const type of ["Feitiço", "Artefato", "Encanto", "Terreno"]) {
    const game = state(); game.players[0].energy = 0; game.players[0].reserve = 2;
    if (type === "Artefato") game.players[0].board.push({ uid: "host", type: "Criatura", slot: 0, abilities: [] });
    game.players[0].hand.push({ id: `card-${type}`, type, page: type === "Artefato" ? 304 : 0, cost: 2, tags: [], text: "", abilities: [] });
    const command = { type: "playCard", owner: 0, cardId: `card-${type}`, slot: 0 };
    assert.equal(executeCommand(game, command).state.players[0].reserve, 0, type);
  }
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
  assert.equal(explicitRuleIds.length, 222);
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

test("every activated ability is once per turn even when legacy data omitted usageLimit", () => {
  const game = state(); game.players[0].board.push({ uid: "legacy", name: "Legado", abilities: [{ id: "active", trigger: "activated", costs: [], effects: [{ type: "draw", amount: 0 }] }] });
  const first = executeCommand(game, { type: "activate", owner: 0, sourceId: "legacy", abilityId: "active", skipPriority: true }).state;
  assert.throws(() => executeCommand(first, { type: "activate", owner: 0, sourceId: "legacy", abilityId: "active", skipPriority: true }), /ability-limit-reached/);
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

test("Arte da Guerra opens an authoritative reposition window at combat start", () => {
  const game = state(); game.players[0].terrain = { ...compileCard({ id: "p163", page: 163, name: "Arte da Guerra", type: "Terreno", cost: 3, text: "" }), uid: "war-art" };
  const result = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(result.phase, "combate");
  assert.deepEqual(result.pendingReposition?.owners, [0, 1]);
});

test("Armadura de Ferro Maciço grants Robusto only while attached", () => {
  const game = state(); game.players[0].board.push({ uid: "host", type: "Criatura", slot: 0, hp: 4, damage: 0, tags: [], grantedKeywords: [], modifiers: [], abilities: [] });
  game.players[0].hand.push(compileCard({ id: "p156", page: 156, name: "Armadura de Ferro Maciço", type: "Artefato", cost: 0, text: "", tags: [] }));
  const equipped = executeCommand(game, { type: "playCard", owner: 0, cardId: "p156", attachedTo: "host", slot: 0, skipPriority: true }).state;
  const damaged = structuredClone(equipped); defaultEffectHandlers.damage(damaged, { type: "damage", amount: 3 }, { owner: 1, targetIds: ["host"] });
  assert.equal(damaged.players[0].board[0].damage, 2);
});

test("Correntes Purificadoras never banishes its equipped creature and banishes itself instead of entering grave", () => {
  const game = state(); game.players[0].board.push({ uid: "host", type: "Criatura", slot: 0, hp: 4, tags: [], modifiers: [], abilities: [] });
  game.players[0].hand.push(compileCard({ id: "p154", page: 154, name: "Correntes Purificadoras", type: "Artefato", cost: 0, text: "", tags: [] }));
  const equipped = executeCommand(game, { type: "playCard", owner: 0, cardId: "p154", attachedTo: "host", slot: 0, skipPriority: true }).state;
  const destroyed = executeCommand(equipped, { type: "emit", owner: 0, event: { type: "test" } }, { handlers: { testDestroy: () => {} } }).state;
  defaultEffectHandlers.destroy(destroyed, { type: "destroy", target: "selected" }, { owner: 1, targetIds: [destroyed.players[0].support[0].uid] });
  assert.equal(destroyed.players[0].board[0].uid, "host");
  assert.equal(destroyed.players[0].grave.length, 0);
  assert.equal(destroyed.players[0].obscuro[0].page, 154);
});

test("Correntes Purificadoras draws when its equipped creature is targeted", () => {
  const game = state(); game.active = 1; game.players[0].board.push({ uid: "host", type: "Criatura", slot: 0, hp: 4, damage: 0, tags: [], modifiers: [], abilities: [] });
  game.players[0].support.push({ ...compileCard({ id: "p154", page: 154, name: "Correntes Purificadoras", type: "Artefato", cost: 0, text: "", tags: [] }), uid: "chains", slot: 0, attachedTo: "host", graveDestination: "obscuro" });
  game.players[0].deck.push({ id: "drawn" });
  game.players[1].hand.push({ id: "targeting-spell", name: "Efeito alvo", type: "Feitiço", cost: 0, tags: [], abilities: [{ id: "hit", trigger: "onPlay", costs: [], effects: [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }] }] });
  const result = executeCommand(game, { type: "playCard", owner: 1, cardId: "targeting-spell", targetIds: ["host"], hasPriority: true, skipPriority: true }).state;
  assert.equal(result.players[0].hand[0].id, "drawn");
  assert.equal(result.players[0].board[0].uid, "host");
});

test("Túmulo do Sacrifício makes Saymon pay the next creature cost with life", () => {
  const game = state(); game.players[0].heroId = "saymon"; game.players[0].level = 2; game.players[0].life = 10; game.players[0].energy = 3;
  game.players[0].hand.push(compileCard({ id: "p146", page: 146, name: "Túmulo do Sacrifício", type: "Feitiço", cost: 0, text: "", tags: [] }));
  let result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p146", skipPriority: true }).state;
  result.players[0].hand.push(compileCard({ id: "blood-unit", name: "Criatura de Sangue", type: "Criatura", cost: 3, atk: 3, hp: 3, text: "", tags: [] }));
  result = executeCommand(result, { type: "playCard", owner: 0, cardId: "blood-unit", slot: 0, skipPriority: true }).state;
  assert.equal(result.players[0].life, 7);
  assert.equal(result.players[0].energy, 3);
  assert.equal(result.players[0].heroXP, 1);
  assert.equal(result.players[0].nextCreaturePaysLife, false);
});

test("Nascer do Sol only targets Vampiro creatures and cannot be cast without one", () => {
  const noVampire = state(); noVampire.players[0].hand.push(compileCard({ id: "p143", page: 143, name: "Nascer do Sol", type: "Feitiço", cost: 0, text: "", tags: [] }));
  noVampire.players[1].board.push({ uid: "human", type: "Criatura", subtypes: ["Humano"], hp: 2, damage: 0, modifiers: [], tags: [] });
  assert.throws(() => executeCommand(noVampire, { type: "playCard", owner: 0, cardId: "p143", targetIds: ["enemy-hero"], skipPriority: true }), /invalid-target/);
  assert.throws(() => executeCommand(noVampire, { type: "playCard", owner: 0, cardId: "p143", targetIds: ["human"], skipPriority: true }), /invalid-target/);
  assert.throws(() => executeCommand(noVampire, { type: "playCard", owner: 0, cardId: "p143", skipPriority: true }), /invalid-target-count/);
  const game = state(); game.players[0].life = 20; game.players[0].hand.push(compileCard({ id: "p143", page: 143, name: "Nascer do Sol", type: "Feitiço", cost: 0, text: "", tags: [] }));
  game.players[1].board.push({ uid: "vampire", type: "Criatura", subtypes: ["Vampiro"], hp: 2, damage: 0, modifiers: [], tags: [] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p143", targetIds: ["vampire"], skipPriority: true }).state;
  assert.equal(result.players[1].board.length, 0); assert.equal(result.players[0].life, 24);
});

test("Pacto de Sangue resolves its activation without opening a response lock", () => {
  const game = state(); game.players[0].life = 10;
  game.players[0].board.push({ uid: "host", type: "Criatura", atk: 2, hp: 4, tags: [], modifiers: [], abilities: [] });
  const pact = compileCard({ id: "p141", page: 141, name: "Pacto de Sangue", type: "Artefato", cost: 0, text: "", tags: [] });
  game.players[0].support.push({ ...pact, uid: "pact", attachedTo: "host", exhausted: false, summoning: false });
  const result = executeCommand(game, { type: "activate", owner: 0, sourceId: "pact", abilityId: pact.abilities[0].id, skipPriority: true }).state;
  assert.equal(result.players[0].life, 8); assert.equal(result.players[0].support[0].exhausted, true);
  assert.equal(result.players[0].board[0].modifiers.at(-1).attack, 2); assert.equal(result.pendingResponse, undefined);
});

test("Condutor de Rasnóvia replaces its First Act with a bounded Vampiro search", () => {
  const game = state(); game.players[0].life = 20; game.players[0].deck.push({ id: "drawn" }, { id: "cheap", type: "Criatura", cost: 3, subtypes: ["Vampiro"] }, { id: "valid", type: "Criatura", cost: 4, subtypes: ["Vampiro"] });
  game.players[0].hand.push(compileCard({ id: "p135", page: 135, name: "Condutor de Rasnóvia", type: "Criatura", cost: 0, atk: 3, hp: 3, text: "", tags: [] }));
  const entered = executeCommand(game, { type: "playCard", owner: 0, cardId: "p135", slot: 0, skipPriority: true }).state;
  const source = entered.players[0].board[0]; assert.equal(entered.players[0].life, 16); assert.equal(entered.players[0].hand[0].id, "drawn"); assert.equal(source.firstActReplaced, true);
  defaultEffectHandlers.search(entered, source.abilities[0].effects[0], { owner: 0, sourceId: source.uid });
  assert.equal(entered.pendingDecision.effect.minCost, 4); assert.equal(entered.pendingDecision.effect.subtype, "Vampiro"); assert.equal(entered.pendingDecision.effect.amount, 1);
});

test("Saymon creatures with printed life loss debit life when they enter", () => {
  for (const [page, amount] of [[130, 3], [133, 4]]) {
    const game = state(); game.players[0].heroId = "saymon"; game.players[0].life = 20;
    game.players[0].hand.push(compileCard({ id: `p${page}`, page, name: page === 130 ? "Servo Iniciante" : "O Carniceiro", type: "Criatura", cost: 0, atk: 3, hp: 2, text: "", tags: [] }));
    const result = executeCommand(game, { type: "playCard", owner: 0, cardId: `p${page}`, slot: 0, skipPriority: true }).state;
    assert.equal(result.players[0].life, 20 - amount, `p${page}`);
    assert.equal(result.players[0].heroXP, 1, `p${page}`);
  }
});

test("dangerous generic-parser false positives use explicit authoritative rules", () => {
  const expected = {
    p5: ["static", "onCombatDamage"], p20: ["activated"], p49: ["onCardPlayed"], p63: ["onPlay"], p80: ["onSpellCast", "activated"],
    p107: ["activated"], p134: ["onMaintenance", "activated"], p173: ["onCreatureDestroyed"], p267: ["activated"], p280: ["onEnter"],
    p289: ["onPlay"], p295: ["onCreatureEnter"], p302: ["onAttachedCreatureTargeted"], p306: ["activated"], p309: ["onTurnEnd", "activated"]
  };
  for (const [id, triggers] of Object.entries(expected)) assert.deepEqual(compileCard({ id, page: Number(id.slice(1)), type: "Criatura", text: "" }).abilities.map((ability) => ability.trigger), triggers, id);
});

test("Anéis de Esmeralda increase maximum energy and destroy only themselves", () => {
  for (const page of [20, 306]) {
    const game = state(), card = compileCard({ id: `p${page}`, page, name: "Anel de Esmeralda", type: "Artefato", cost: 0, text: "" }); game.players[0].maxEnergy = 4; game.players[0].energy = 4;
    game.players[0].support.push({ ...card, uid: `ring-${page}`, slot: 0, exhausted: false, summoning: false });
    const result = executeCommand(game, { type: "activate", owner: 0, sourceId: `ring-${page}`, abilityId: card.abilities[0].id, skipPriority: true }).state;
    assert.equal(result.players[0].maxEnergy, 5); assert.equal(result.players[0].support.length, 0); assert.equal(result.players[0].grave[0].page, page);
  }
});

test("Nevasca freezes every enemy and damages only creatures already frozen", () => {
  const game = state(); game.players[1].board.push({ uid: "fresh", hp: 3, damage: 0, tags: [] }, { uid: "frozen", hp: 4, damage: 0, tags: ["Congelado"], frozen: true });
  game.players[0].hand.push(compileCard({ id: "p63", page: 63, name: "Nevasca", type: "Feitiço", cost: 0, text: "" }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p63", skipPriority: true }).state;
  assert.ok(result.players[1].board.every((card) => card.frozen)); assert.equal(result.players[1].board.find((card) => card.uid === "fresh").damage, 0); assert.equal(result.players[1].board.find((card) => card.uid === "frozen").damage, 2);
});

test("multi-step search decisions resume their authoritative continuation", () => {
  const game = state(); game.players[0].hand.push(compileCard({ id: "p289", page: 289, name: "Logística", type: "Feitiço", cost: 0, text: "" }));
  game.players[0].deck.push({ id: "u1", type: "Criatura", text: "" }, { id: "u2", type: "Criatura", text: "" }, { id: "spell", type: "Feitiço", text: "" });
  let result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p289", skipPriority: true }).state; assert.equal(result.pendingDecision.kind, "search");
  result = executeCommand(result, { type: "resolveDecision", owner: 0, selectedCardIds: ["u1", "u2"] }).state; assert.equal(result.pendingDecision.kind, "hand-to-deck-bottom");
  result = executeCommand(result, { type: "resolveDecision", owner: 0, selectedCardIds: ["u1", "u2"] }).state; assert.equal(result.pendingDecision, null); assert.deepEqual(result.players[0].deck.slice(-2).map((card) => card.id), ["u1", "u2"]);
});

test("Cobra Dor loses life on maintenance and converts removed markers into healing", () => {
  const game = state(), card = compileCard({ id: "p134", page: 134, name: "O Cobra Dor", type: "Criatura", text: "" }); game.players[0].board.push({ ...card, uid: "cobra", slot: 0, markers: { action: 2 }, exhausted: false, summoning: false }, { ...card, uid: "cobra-2", slot: 1, markers: { action: 0 }, exhausted: false, summoning: false });
  let result = executeCommand(game, { type: "emit", owner: 0, event: { type: "onMaintenance", owner: 0 } }).state; assert.equal(result.players[0].life, 26); assert.equal(result.players[0].board[0].markers.action, 3); assert.equal(result.players[0].board[1].markers.action, 1);
  result.players[0].life = 20; result = executeCommand(result, { type: "activate", owner: 0, sourceId: "cobra", abilityId: card.abilities[1].id, markerAmount: 3, skipPriority: true }).state; assert.equal(result.players[0].life, 23); assert.equal(result.players[0].board[0].markers.action, 0);
  assert.equal(result.players[0].board[1].markers.action, 1);
  assert.throws(() => executeCommand(result, { type: "activate", owner: 0, sourceId: "cobra", abilityId: card.abilities[1].id, markerAmount: 1, skipPriority: true }), /ability-limit-reached/);
});

test("Investida Alada resolves its chosen combat in principal phase without another response lock", () => {
  const game = state(), spell = compileCard({ id: "p17", page: 17, name: "Investida Alada", type: "Feitiço", cost: 0, text: "" });
  game.players[0].hand.push(spell); game.players[0].board.push({ uid: "dragon", name: "Dragão", type: "Criatura", subtypes: ["Dragão"], atk: 3, hp: 4, damage: 0, exhausted: false, summoning: false, tags: [], modifiers: [] }); game.players[1].board.push({ uid: "target", name: "Alvo", type: "Criatura", atk: 1, hp: 5, damage: 0, exhausted: false, summoning: false, tags: [], modifiers: [] });
  let result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p17", skipPriority: true }).state; assert.equal(result.pendingDecision.kind, "forced-attack");
  result = executeCommand(result, { type: "resolveDecision", owner: 0, attackerId: "dragon", defenderId: "target" }, { priority: true }).state;
  assert.equal(result.pendingDecision, null); assert.equal(result.pendingResponse, undefined); assert.equal(result.pendingAction, undefined); assert.equal(result.players[1].board[0].damage, 3);
});

test("Silêncio Ensurdecedor suffocates only while its source remains in play", () => {
  const game = state(), silence = compileCard({ id: "p147", page: 147, name: "Silêncio Ensurdecedor", type: "Encanto", cost: 0, text: "" });
  game.players[0].hand.push(silence); game.players[1].board.push({ uid: "victim", name: "Alvo", type: "Criatura", atk: 2, hp: 3, damage: 0, exhausted: false, summoning: false, tags: ["Voar"], modifiers: [] });
  let result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p147", instanceId: "silence", slot: 0, targetIds: ["victim"], skipPriority: true }).state; assert.equal(result.players[1].board[0].suffocated, true);
  const source = result.players[0].support[0]; result.players[0].support = [];
  result = executeCommand(result, { type: "emit", owner: 0, event: { type: "onPermanentLeaves", owner: 0, sourceId: source.uid, card: source } }).state; assert.equal(result.players[1].board[0].suffocated, false);
});

test("Castelo Carmesim enters without a target and reacts to each controller life-loss event", () => {
  const game = state(), castle = compileCard({ id: "p148", page: 148, name: "Castelo Carmesim", type: "Terreno", cost: 0, text: "" }); game.players[0].hand.push(castle); game.players[0].deck.push({ id: "drawn" });
  assert.equal(cardPlayTargetPolicy(castle).selections, 0);
  let result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p148", slot: 0, skipPriority: true }).state; assert.equal(result.players[0].terrain.page, 148);
  result.players[0].lifeLossEvents = 1; result = executeCommand(result, { type: "emit", owner: 0, event: { type: "onLifeLost", owner: 0, amount: 2 } }).state; assert.equal(result.players[0].hand.at(-1).id, "drawn");
  result.players[0].lifeLossEvents = 2; result = executeCommand(result, { type: "emit", owner: 0, event: { type: "onLifeLost", owner: 0, amount: 2 } }).state; assert.equal(result.pendingDecision.kind, "targets");
  result = executeCommand(result, { type: "resolveDecision", owner: 0, targetIds: ["enemy-hero"] }).state; assert.equal(result.players[1].life, 28);
});

test("Dominus Nox discounts only life lost during the current turn", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /c\.page===139\)cost=Math\.max\(1,cost-Math\.max\(0,p\.lifeLostThisTurn\|\|0\)\)/);
  assert.doesNotMatch(page, /c\.page===139[^;]*30-p\.life/);
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

test("migrated targeting reads executable First Act data instead of passive reminder text", () => {
  const saideira = compileCard({ id: "p181", page: 181, name: "Saideira dos Recrutas!", type: "Terreno", text: "Os efeitos de Primeiro Ato das criaturas Recruta também são ativados quando deixam o campo.", tags: ["Primeiro Ato"] });
  const smallgui = compileCard({ id: "p6", page: 6, name: "Smallgui", type: "Criatura", text: "", tags: ["Primeiro Ato"] });
  const apaixonado = compileCard({ id: "p183", page: 183, name: "Recruta Apaixonado", type: "Criatura", text: "", tags: ["Primeiro Ato"] });
  assert.equal(cardPlayTargetPolicy(saideira).selections, 0);
  assert.equal(cardPlayTargetPolicy(smallgui).scope, TargetScope.ANY_CREATURE);
  assert.equal(cardPlayTargetPolicy(smallgui).selections, 1);
  assert.equal(cardPlayTargetPolicy(apaixonado).scope, TargetScope.ALLY_CREATURE);
});

test("Recruta Vigilante enters without asking for a target when every creature is ready", () => {
  const vigilante = compileCard({ id: "p190", page: 190, name: "Recruta Vigilante", type: "Criatura", cost: 1, atk: 1, hp: 1, text: "Primeiro Ato: Retorne uma criatura virada para mão de seu dono.", tags: ["Primeiro Ato"] });
  const policy = cardPlayTargetPolicy(vigilante);
  assert.equal(policy.steps[0].requireExhausted, true);
  const game = state();
  game.players[0].hand.push(vigilante);
  game.players[0].board.push({ uid: "ready", id: "ready", type: "Criatura", slot: 0, exhausted: false, hp: 2, damage: 0, abilities: [] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p190", instanceId: "vigilante", slot: 1 }).state;
  assert.ok(result.players[0].board.some((card) => card.uid === "vigilante"));
  assert.equal(result.pendingDecision, undefined);
});

test("Saideira passively replays a Recruit First Act on every leave-field event", () => {
  for (const eventType of ["onDestroyed", "onPermanentLeaves"]) {
    const game = state();
    game.players[0].life = 20;
    game.players[0].terrain = { uid: "saideira", type: "Terreno", staticModifiers: [{ type: "recruitFirstActOnLeave" }], abilities: [] };
    const recruit = compileCard({ id: "p189", page: 189, name: "Recruta Pinguço", type: "Criatura", text: "", tags: ["Primeiro Ato"], subtypes: ["Recruta"] });
    const result = executeCommand(game, { type: "emit", event: { type: eventType, owner: 0, sourceId: "recruit", card: { ...recruit, uid: "recruit" } } }).state;
    assert.equal(result.players[0].life, 22, eventType);
    assert.equal(result.pendingDecision, undefined);
  }
});

test("Saideira pauses for an authoritative target when the repeated First Act targets", () => {
  const game = state();
  game.players[0].terrain = { uid: "saideira", type: "Terreno", staticModifiers: [{ type: "recruitFirstActOnLeave" }], abilities: [] };
  game.players[0].board.push({ uid: "ally", type: "Criatura", slot: 0, hp: 2, modifiers: [], abilities: [] });
  const recruit = compileCard({ id: "p183", page: 183, name: "Recruta Apaixonado", type: "Criatura", text: "", tags: ["Primeiro Ato"], subtypes: ["Recruta"] });
  const pending = executeCommand(game, { type: "emit", event: { type: "onPermanentLeaves", owner: 0, sourceId: "recruit", card: { ...recruit, uid: "recruit" } } }).state;
  assert.equal(pending.pendingDecision.kind, "targets");
  assert.equal(pending.pendingDecision.owner, 0);
  const resolved = executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["ally"] }).state;
  assert.equal(resolved.players[0].board[0].modifiers[0].health, 2);
  assert.equal(resolved.pendingDecision, null);
});

test("Saideira skips a targeted First Act when no valid target remains", () => {
  const game = state();
  game.players[0].terrain = { uid: "saideira", type: "Terreno", staticModifiers: [{ type: "recruitFirstActOnLeave" }], abilities: [] };
  const recruit = compileCard({ id: "p183", page: 183, name: "Recruta Apaixonado", type: "Criatura", text: "", tags: ["Primeiro Ato"], subtypes: ["Recruta"] });
  const result = executeCommand(game, { type: "emit", event: { type: "onPermanentLeaves", owner: 0, sourceId: "recruit", card: { ...recruit, uid: "recruit" } } }).state;
  assert.equal(result.pendingDecision, undefined);
  assert.equal(result.players[0].board.length, 0);
});

test("First Act duplicators skip the extra instance when it has no valid target", () => {
  const game = state();
  const recruit = { uid: "recruit", id: "recruit", name: "Recruta de Teste", type: "Criatura", slot: 1, subtypes: ["Recruta"], tags: ["Primeiro Ato"], abilities: [{ id: "enemy-etb", trigger: "onEnter", costs: [], effects: [{ type: "damage", amount: 2, target: "enemyCreature", selections: 1 }] }] };
  game.players[0].board.push({ uid: "chief", slot: 0, staticModifiers: [{ type: "doubleRecruitFirstAct" }], abilities: [] }, recruit);
  const result = executeCommand(game, { type: "emit", event: { type: "onCreatureEnter", owner: 0, sourceId: "recruit", card: recruit } }).state;
  assert.equal(result.pendingDecision, undefined);
  assert.equal(result.players[1].board.length, 0);
});

test("Nada se cria selects a creature and replays its First Act through authoritative decisions", () => {
  const game = state();
  const source = compileCard({ id: "p183", page: 183, name: "Recruta Apaixonado", type: "Criatura", text: "", tags: ["Primeiro Ato"], subtypes: ["Recruta"] });
  game.players[0].board.push({ uid: "invalid-source", name: "Sem alvo inimigo", type: "Criatura", slot: 2, abilities: [{ id: "enemy-only", trigger: "onEnter", effects: [{ type: "damage", amount: 1, target: "enemyCreature" }] }] }, { ...source, uid: "source", slot: 0, modifiers: [] }, { uid: "target", name: "Alvo", type: "Criatura", slot: 1, hp: 2, tags: [], modifiers: [], abilities: [] });
  game.players[0].hand.push(compileCard({ id: "p151", page: 151, name: "Nada se cria, tudo se copia", type: "Feitiço", cost: 0, text: "", tags: [] }));
  const chooseSource = executeCommand(game, { type: "playCard", owner: 0, cardId: "p151" }).state;
  assert.equal(chooseSource.pendingDecision.kind, "replay-ability");
  assert.equal(chooseSource.pendingDecision.effect.choices.length, 1);
  assert.match(chooseSource.pendingDecision.effect.choices[0][0].name, /Recruta Apaixonado/);
  const chooseTarget = executeCommand(chooseSource, { type: "resolveDecision", owner: 0, selectedCardId: "source" }).state;
  assert.equal(chooseTarget.pendingDecision.kind, "targets");
  const resolved = executeCommand(chooseTarget, { type: "resolveDecision", owner: 0, targetIds: ["target"] }).state;
  assert.equal(resolved.players[0].board.find((unit) => unit.uid === "target").modifiers[0].health, 2);
});

test("Nada se cria rejects play when no First Act can currently resolve", () => {
  const game = state();
  game.players[0].board.push({ uid: "source", type: "Criatura", abilities: [{ id: "enemy-only", trigger: "onEnter", effects: [{ type: "damage", amount: 1, target: "enemyCreature" }] }] });
  game.players[0].hand.push(compileCard({ id: "p151", page: 151, name: "Nada se cria, tudo se copia", type: "Feitiço", cost: 0, text: "", tags: [] }));
  assert.throws(() => executeCommand(game, { type: "playCard", owner: 0, cardId: "p151" }), /play-condition-not-met/);
});

test("Chefe da Guarda adds exactly one First Act instance for entering Recruits", () => {
  const game = state();
  game.players[0].life = 20;
  game.players[0].board.push({ uid: "chief", slot: 0, staticModifiers: [{ type: "doubleRecruitFirstAct" }], abilities: [] });
  game.players[0].hand.push(compileCard({ id: "p189", page: 189, name: "Recruta Pinguço", type: "Criatura", cost: 0, text: "", tags: ["Primeiro Ato"], subtypes: ["Recruta"] }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p189", slot: 1 }).state;
  assert.equal(result.players[0].life, 24);
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

test("a Defensor X used below its capacity is still turned when combat ends", () => {
  const game = state(); game.phase = "combate";
  game.players[0].board.push({ uid: "attacker", atk: 1, hp: 3, tags: [], exhausted: false, summoning: false, modifiers: [] });
  game.players[1].board.push({ uid: "wall", atk: 0, hp: 5, tags: ["Defensor 3"], exhausted: false, defenseUses: 0, modifiers: [] });
  const defended = executeCommand(game, { type: "attack", owner: 0, attackerId: "attacker", defenderId: "wall" }).state;
  assert.equal(defended.players[1].board[0].exhausted, false);
  const ended = executeCommand(defended, { type: "advancePhase" }).state;
  assert.equal(ended.phase, "fim");
  assert.equal(ended.players[1].board[0].exhausted, true);
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

test("temporary stat and keyword effects across the catalog expire together", () => {
  const game = state();
  game.players[0].board.push({ uid: "dragon", type: "Criatura", subtypes: ["Dragão"], modifiers: [], tags: [] });
  game.players[0].hand.push(compileCard({ id: "p16", page: 16, name: "Escama Protetora", type: "Feitiço", cost: 0, text: "", tags: [] }));
  const buffed = executeCommand(game, { type: "playCard", owner: 0, cardId: "p16", targetIds: ["dragon"] }).state;
  assert.deepEqual(buffed.players[0].board[0].modifiers[0], { attack: 0, health: 2, duration: "turn" });

  buffed.players[0].hand.push(compileCard({ id: "p225", page: 225, name: "Café Descafeinado", type: "Feitiço", cost: 0, text: "", tags: ["Acelerado"] }));
  const silenced = executeCommand(buffed, { type: "playCard", owner: 0, cardId: "p225", targetIds: ["dragon"] }).state;
  assert.ok(silenced.players[0].board[0].temporaryTags.includes("Sufocado"));
  silenced.phase = "fim";
  const expired = executeCommand(silenced, { type: "advancePhase" }).state;
  assert.deepEqual(expired.players[0].board[0].modifiers, []);
  assert.deepEqual(expired.players[0].board[0].temporaryTags, []);
});

test("temporary subtype-restricted effects reject an invalid target", () => {
  const game = state();
  game.players[0].board.push({ uid: "human", type: "Criatura", subtypes: ["Humano"], modifiers: [], tags: [] });
  game.players[0].hand.push(compileCard({ id: "p16", page: 16, type: "Feitiço", cost: 0, text: "", tags: [] }));
  assert.throws(() => executeCommand(game, { type: "playCard", owner: 0, cardId: "p16", targetIds: ["human"] }), /invalid-target-subtype/);
});

test("Vingador gains a temporary bonus only when another allied creature dies", () => {
  const game = state();
  const avenger = { ...compileCard({ id: "p114", page: 114, name: "Vingador", type: "Criatura", text: "", tags: [] }), uid: "avenger", modifiers: [] };
  game.players[0].board.push(avenger);
  const result = executeCommand(game, { type: "emit", event: { type: "onCreatureDestroyed", owner: 0, sourceId: "victim", cardId: "victim", card: { uid: "victim", type: "Criatura" } } }).state;
  assert.deepEqual(result.players[0].board[0].modifiers[0], { attack: 1, health: 0, duration: "turn" });
  const self = executeCommand(game, { type: "emit", event: { type: "onCreatureDestroyed", owner: 0, sourceId: "avenger", cardId: "avenger", card: avenger } }).state;
  assert.equal(self.players[0].board[0].modifiers.length, 0);
});

test("temporary leave-field listeners remain active only until turn end", () => {
  const game = state(); game.players[0].energy = 0;
  game.players[0].hand.push(compileCard({ id: "p47", page: 47, name: "COMBADO NÃO SAI CARO", type: "Feitiço", cost: 0, text: "", tags: [] }));
  const active = executeCommand(game, { type: "playCard", owner: 0, cardId: "p47", slot: 0 }).state;
  assert.equal(active.players[0].support.length, 1);
  const rewarded = executeCommand(active, { type: "emit", event: { type: "onPermanentLeaves", owner: 0, sourceId: "goblin", card: { uid: "goblin", type: "Criatura", subtypes: ["Goblin"] } } }).state;
  assert.equal(rewarded.players[0].energy, 1);
  rewarded.phase = "combate";
  const ended = executeCommand(rewarded, { type: "advancePhase" }).state;
  assert.equal(ended.players[0].support.length, 0);
  assert.equal(ended.players[0].grave.at(-1).id, "p47");
});

test("reserve pays non-creature activated abilities but not creature abilities", () => {
  const artifactGame = state(); artifactGame.players[0].energy = 0; artifactGame.players[0].reserve = 2;
  const relic = { uid: "relic", type: "Artefato", abilities: [{ id: "paid-effect", trigger: "activated", costs: [{ type: "energy", amount: 2 }], effects: [{ type: "gainEnergy", amount: 1 }] }] };
  artifactGame.players[0].support.push(relic);
  const paid = executeCommand(artifactGame, { type: "activate", owner: 0, sourceId: "relic", abilityId: "paid-effect" }).state;
  assert.equal(paid.players[0].reserve, 0); assert.equal(paid.players[0].energy, 1);

  const creatureGame = state(); creatureGame.phase = "combate"; creatureGame.players[0].energy = 0; creatureGame.players[0].reserve = 2;
  const barbarian = { ...compileCard({ id: "p198", page: 198, name: "Bárbaro Cansado", type: "Criatura", text: "", tags: [] }), uid: "barbarian", defenseUses: 1, modifiers: [] };
  creatureGame.players[0].board.push(barbarian);
  assert.throws(() => executeCommand(creatureGame, { type: "activate", owner: 0, sourceId: "barbarian", abilityId: barbarian.abilities[0].id }), /not-enough-energy/);
});

test("combat-duration bonuses expire when the combat phase ends", () => {
  const game = state(); game.phase = "combate"; game.players[0].energy = 1;
  const barbarian = { ...compileCard({ id: "p198", page: 198, name: "Bárbaro Cansado", type: "Criatura", text: "", tags: [] }), uid: "barbarian", defenseUses: 1, modifiers: [] };
  game.players[0].board.push(barbarian);
  const activated = executeCommand(game, { type: "activate", owner: 0, sourceId: "barbarian", abilityId: barbarian.abilities[0].id }).state;
  assert.equal(activated.players[0].board[0].modifiers[0].duration, "combat");
  const ended = executeCommand(activated, { type: "advancePhase" }).state;
  assert.deepEqual(ended.players[0].board[0].modifiers, []);
});

test("Café Expresso choices preserve their selected creature target", () => {
  const game = state(); game.players[0].board.push({ uid: "target", type: "Criatura", modifiers: [], tags: [] });
  game.players[0].hand.push(compileCard({ id: "p230", page: 230, name: "Café Expresso", type: "Feitiço", cost: 0, text: "", tags: ["Acelerado"] }));
  const pending = executeCommand(game, { type: "playCard", owner: 0, cardId: "p230", targetIds: ["target"] }).state;
  assert.equal(pending.pendingDecision.kind, "choice");
  const result = executeCommand(pending, { type: "resolveDecision", owner: 0, choiceIndex: 1 }).state;
  assert.deepEqual(result.players[0].board[0].modifiers[0], { attack: 0, health: 1, duration: "turn" });
});

test("global temporary buffs affect every allied creature and no enemy", () => {
  const game = state(); game.players[0].life = 10;
  game.players[0].board.push({ uid: "a", type: "Criatura", modifiers: [], tags: [] }, { uid: "b", type: "Criatura", modifiers: [], tags: [] });
  game.players[1].board.push({ uid: "enemy", type: "Criatura", modifiers: [], tags: [] });
  game.players[0].hand.push(compileCard({ id: "p285", page: 285, name: "Medida Desesperada", type: "Feitiço", cost: 0, text: "", tags: [] }));
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p285" }).state;
  for (const unit of result.players[0].board) { assert.ok(unit.temporaryTags.includes("Atropelar")); assert.equal(unit.modifiers[0].attack, 2); }
  assert.equal(result.players[1].board[0].temporaryTags, undefined);
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
  assert.equal(game.players[0].hand[0].uid, undefined);
});

test("a creature returned to hand is restored to its printed card state", () => {
  const game = state();
  game.players[0].board.push({ uid:"changed", id:"base", _printedState:{ id:"base", name:"Impressa", type:"Criatura", cost:2, atk:3, hp:4, text:"", tags:[], abilities:[] }, name:"Alterada", type:"Criatura", cost:0, atk:9, hp:9, damage:7, exhausted:true, modifiers:[{attack:5,health:5,duration:"turn"}], tags:["Congelado"], abilities:[] });
  defaultEffectHandlers.returnToHand(game,{type:"returnToHand"},{owner:1,targetIds:["changed"]});
  const returned=game.players[0].hand[0];
  assert.deepEqual({uid:returned.uid,name:returned.name,cost:returned.cost,atk:returned.atk,hp:returned.hp,damage:returned.damage,modifiers:returned.modifiers},{uid:undefined,name:"Impressa",cost:2,atk:3,hp:4,damage:undefined,modifiers:undefined});
});

test("combat damage remains authoritative across creature and hero targets", () => {
  const creatureCombat=state(); creatureCombat.phase="combate";
  creatureCombat.players[0].board.push({uid:"attacker",type:"Criatura",atk:4,hp:5,damage:0,tags:[],modifiers:[],abilities:[]});
  creatureCombat.players[1].board.push({uid:"defender",type:"Criatura",atk:2,hp:6,damage:1,tags:[],modifiers:[],abilities:[]});
  const exchanged=executeCommand(creatureCombat,{type:"attack",owner:0,attackerId:"attacker",defenderId:"defender",skipPriority:true},{priority:true}).state;
  assert.equal(exchanged.players[0].board[0].damage,2);
  assert.equal(exchanged.players[1].board[0].damage,5);
  const heroCombat=state(); heroCombat.phase="combate"; heroCombat.players[0].board.push({uid:"direct",type:"Criatura",atk:4,hp:3,damage:0,tags:[],modifiers:[],abilities:[]});
  const direct=executeCommand(heroCombat,{type:"attack",owner:0,attackerId:"direct",skipPriority:true},{priority:true}).state;
  assert.equal(direct.players[1].life,26);
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
  assert.equal(migrated.length, 308); assert.equal(pending.length, 0);
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

test("online combat advances once from declaration through defender choice", () => {
  const game = state(); game.phase = "combate";
  game.players[0].board.push({ uid: "attacker", id: "attacker", name: "Atacante", type: "Criatura", slot: 0, atk: 3, hp: 3, damage: 0, exhausted: false, summoning: false, stunned: false, tags: [], abilities: [] });
  game.players[1].board.push({ uid: "defender", id: "defender", name: "Defensor", type: "Criatura", slot: 0, atk: 1, hp: 4, damage: 0, exhausted: false, stunned: false, tags: [], abilities: [] });
  const declared = executeCommand(game, { type: "declareAttack", owner: 0, attackerId: "attacker" }, { priority: true }).state;
  assert.equal(declared.combatAction.stage, "priority");
  assert.equal(declared.pendingResponse.responder, 1);
  const firstPass = executeCommand(declared, { type: "passPriority", owner: 1 }, { priority: true }).state;
  assert.equal(firstPass.pendingResponse.responder, 0);
  const choose = executeCommand(firstPass, { type: "passPriority", owner: 0 }, { priority: true }).state;
  assert.equal(choose.pendingResponse, null);
  assert.equal(choose.combatAction.stage, "choosing");
  const charging = executeCommand(choose, { type: "selectDefender", owner: 1, attackerId: "attacker", defenderId: "defender", targetHero: false }, { priority: true }).state;
  assert.equal(charging.combatAction.stage, "charging");
  const resolved = executeCommand(charging, { type: "attack", owner: 0, attackerId: "attacker", defenderId: "defender", skipPriority: true }, { priority: true }).state;
  assert.equal(resolved.combatAction, null);
  assert.equal(resolved.players[1].board[0].damage, 3);
});

test("Gimble's Valorian can deal direct multiplayer damage without locking combat", () => {
  const game = state(); game.phase = "combate"; game.players[0].heroId = "gimble";
  game.players[0].board.push({ uid: "valorian", id: "p3", name: "Valorian, o pseudodragão", type: "Criatura", slot: 0, atk: 3, hp: 3, damage: 0, exhausted: false, summoning: false, stunned: false, tags: ["Voar"], abilities: [] });
  let next = executeCommand(game, { type: "declareAttack", owner: 0, attackerId: "valorian" }, { priority: true }).state;
  next = executeCommand(next, { type: "passPriority", owner: 1 }, { priority: true }).state;
  next = executeCommand(next, { type: "passPriority", owner: 0 }, { priority: true }).state;
  next = executeCommand(next, { type: "selectDefender", owner: 1, attackerId: "valorian", targetHero: true }, { priority: true }).state;
  const resolved = executeCommand(next, { type: "attack", owner: 0, attackerId: "valorian", skipPriority: true }, { priority: true }).state;
  assert.equal(resolved.players[1].life, 27);
  assert.equal(resolved.combatAction, null);
  assert.equal(resolved.pendingResponse, null);
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

test("priority API exposes only legal accelerated cards and usable activations", () => {
  const game = state();
  game.pendingAction = { type: "playCard", owner: 1, cardId: "original" };
  game.pendingResponse = { responder: 0, actor: 1, action: "original", passes: 0 };
  game.players[0].energy = 0; game.players[0].reserve = 2;
  game.players[0].hand.push(
    { id: "fast", name: "Resposta", type: "Feitiço", cost: 2, tags: ["Acelerado"], abilities: [] },
    { id: "slow", name: "Lento", type: "Feitiço", cost: 0, tags: [], abilities: [] },
    { id: "expensive", name: "Caro", type: "Feitiço", cost: 3, tags: ["Acelerado"], abilities: [] },
  );
  game.players[0].board.push({ uid: "ready", name: "Ativável", abilities: [{ id: "answer", trigger: "activated", costs: [], effects: [] }] });
  const legal = legalPriorityResponses(game, 0);
  assert.deepEqual(legal.map((command) => command.type), ["playCard", "activate"]);
  assert.equal(legal[0].cardId, "fast");
  assert.equal(isAccelerated(game.players[0].hand[1]), false);
  assert.equal(priorityView(game, 0).state, PriorityState.WAITING_FOR_PLAYER);
  assert.equal(priorityView(game, 1).state, PriorityState.WAITING_FOR_OPPONENT);
});

test("assisted control and AI pass immediately when no legal response exists", () => {
  const game = state();
  game.pendingAction = { type: "attack", owner: 0 };
  game.pendingResponse = { responder: 1, actor: 0, action: "attack", passes: 0 };
  game.players[1].hand.push({ id: "slow", type: "Feitiço", cost: 0, tags: [], abilities: [] });
  assert.equal(shouldAutoPass(game, 1, "assisted"), true);
  assert.equal(shouldAutoPass(game, 1, "full-control"), false);
  assert.deepEqual(chooseAIResponse(game, 1, () => 0), { type: "passPriority", owner: 1, auto: true });
});

test("AI selects a legal response through the same authoritative command shape", () => {
  const game = state();
  game.pendingAction = { type: "playCard", owner: 0, cardId: "original" };
  game.pendingResponse = { responder: 1, actor: 0, action: "original", passes: 0 };
  game.players[1].reserve = 3;
  game.players[1].hand.push(
    { id: "small", type: "Feitiço", cost: 1, tags: ["Acelerado"], abilities: [] },
    { id: "large", type: "Feitiço", cost: 3, tags: ["Acelerado"], abilities: [] },
  );
  assert.equal(chooseAIResponse(game, 1, () => 0).cardId, "large");
});

test("multiplayer API exposes the authoritative command path", async () => {
  const [route, machine] = await Promise.all([
    readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/machine.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /body\.action === "command"/);
  assert.match(machine, /AUTHORITATIVE_COMMANDS/);
  assert.match(machine, /executeCommand/);
  assert.match(machine, /applySafeAutoPass/);
  assert.match(machine, /shouldAutoPass/);
});

test("production rooms use durable storage and never masquerade as process-local invites", async () => {
  const [store, createRoute, roomRoute] = await Promise.all([
    readFile(new URL("../app/api/rooms/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rooms/[id]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(store, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(store, /multiplayer_rooms\?on_conflict=id/);
  assert.match(store, /NODE_ENV === "development"/);
  assert.match(store, /Supabase unavailable; reading from Blob fallback/);
  assert.match(store, /Supabase unavailable; writing to Blob fallback/);
  assert.doesNotMatch(store, /HEMSFELL_ROOM_STORE !== "d1"/);
  assert.match(createRoute, /force-dynamic/);
  assert.match(roomRoute, /Cache-Control.*no-store/);
});

test("online priority passes update the local response window from the authoritative room state", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /setResponseWindow\(next\.pendingResponse\?\?null\)/);
  assert.match(page, /const result=await roomAction\("command"/);
  assert.match(page, /return !!result/);
  assert.match(page, /currentGameRef\.current=oriented;setResponseWindow\(oriented\.pendingResponse\?\?null\)/);
  assert.match(page, /game\?\.pendingResponse\?\.responder/);
  assert.match(page, /game\?\.pendingResponse\?\.passes/);
});

test("game client routes migrated cards through the command engine", async () => {
  const [page, lab, legacy, board, tuning, interaction] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lab.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lab-legacy.css", import.meta.url), "utf8"),
    readFile(new URL("../app/board-layout.css", import.meta.url), "utf8"),
    readFile(new URL("../app/board-tuning.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lab-interaction-responsive.css", import.meta.url), "utf8"),
  ]);
  const css = [lab, legacy, board, tuning, interaction].join("\n");
  assert.match(page, /canExecuteCard\(snapshot\)/);
  assert.match(page, /roomAction\("command"/);
  assert.match(page, /executeCommand\(current,\{\.\.\.command,owner\},\{priority:true\}\)/);
  assert.match(page, /role!=="attachment"/);
  assert.match(page, /dragged!\.type!=="Artefato"\|\|!!creature/);
  assert.match(page, /chooseAIResponse/);
  assert.match(page, /legalPriorityResponses/);
  assert.match(page, /shouldAutoPass/);
  assert.match(page, /Resposta: Full Control/);
  assert.match(page, /priority-stack-indicator/);
  assert.match(page, /cardPlayTargetPolicy/);
  assert.match(page, /canChooseAllTargets/);
  assert.match(page, /setResponseWindow\(next\.pendingResponse\?\?null\)/);
  assert.match(page, /passPriorityWindow/);
  assert.match(page, /heroEvolutionProgress\(p\)/);
  assert.match(page, /effectiveCreatureName/);
  assert.match(page, /game\.active!==0/);
  assert.match(page, /canEvolveThisTurn=\{game\.active===0\}/);
  assert.match(page, /modifier\.duration!=="turn"/);
  assert.match(page, /combat-attack-ready/);
  assert.match(page, /summoning-sickness-badge/);
  assert.match(page, /displayName=unit&&controller\?effectiveCreatureName/);
  assert.match(css, /combat-attack-ready-pulse/);
  assert.match(css, /original-card\.summoning-sick/);
  assert.match(css, /auxiliary-slot \.card-tooltip/);
  assert.match(css, /z-index:9020!important/);
  assert.doesNotMatch(page, /className="card-frame-inspect"/);
  assert.match(page, /requestCardInspection\(card\)/);
  assert.match(page, /hero-command-bar/);
  assert.match(page, /card-focus-layer/);
  assert.match(page, /hemsfell-heroes-logo\.png/);
  assert.match(css, /fx-summon-arrive/);
  assert.match(css, /z-index:30000!important/);
});

test("Fatiadora Prateada exempts Recruta Exibido or Iludido and still grants Atropelar", () => {
  const artifactText = 'Se equipada no “Recruta Exibido”, ele agora se chama “Recruta Iludido” e recebe Atropelar.';
  const special = state();
  special.players[0].board.push({ uid: "recruit", name: "Recruta Exibido", type: "Criatura", modifiers: [], tags: [] });
  special.players[0].support.push({ uid: "slicer", name: "Fatiadora Prateada", type: "Artefato", page: 197, attachedTo: "recruit", text: artifactText });
  const effects = explicitCardRules.p197[0].effects;
  for (const effect of effects) defaultEffectHandlers[effect.type](special, effect, { owner: 0, sourceId: "slicer" });
  assert.equal(special.players[0].board[0].modifiers.length, 0);
  assert.ok(special.players[0].board[0].tags.includes("Atropelar"));

  const ordinary = state();
  ordinary.players[0].board.push({ uid: "other", name: "Recruta Apaixonado", type: "Criatura", modifiers: [], tags: [] });
  ordinary.players[0].support.push({ uid: "other-slicer", name: "Fatiadora Prateada", type: "Artefato", page: 197, attachedTo: "other", text: artifactText });
  defaultEffectHandlers.attachedConditionalStats(ordinary, effects[0], { owner: 0, sourceId: "other-slicer" });
  assert.equal(ordinary.players[0].board[0].modifiers[0].attack, -2);
});

test("Saral lets its controller choose a deck and resolves Investigar without exposing the rest", () => {
  const game = state();
  game.players[0].hand.push(compileCard({ id: "p257", page: 257, name: "Saral", type: "Criatura", cost: 1, atk: 1, hp: 1, text: "", tags: [] }));
  game.players[1].deck.push({ id: "revealed", name: "Topo", type: "Feitiço" }, { id: "archived", name: "Fundo", type: "Criatura" }, { id: "third", name: "Terceira", type: "Criatura" });
  const entered = executeCommand(game, { type: "playCard", owner: 0, cardId: "p257", slot: 0, skipPriority: true }).state;
  assert.equal(entered.pendingDecision.kind, "choice");
  assert.equal(entered.pendingDecision.effect.choices.length, 2);
  const investigated = executeCommand(entered, { type: "resolveDecision", owner: 0, choiceIndex: 1 }).state;
  assert.equal(investigated.players[1].deck[0].id, "revealed");
  assert.equal(investigated.players[1].deck.at(-1).id, "archived");
  assert.ok(investigated.rulesEvents?.some((event) => event.type === "onCardRevealed") || investigated.events > entered.events);
});

test("Dança Macabra grants Vampiro only for the turn and prevents combat with Vampiros", () => {
  const game = state();
  game.players[0].hand.push(compileCard({ id: "p142", page: 142, name: "Dança Macabra", type: "Feitiço", cost: 0, text: "", tags: [] }));
  game.players[0].board.push({ uid: "dancer", name: "Dançarino", type: "Criatura", atk: 2, hp: 4, subtypes: [], tags: [], modifiers: [], exhausted: false, summoning: false, attackedThisTurn: false });
  game.players[1].board.push({ uid: "vampire", name: "Vampiro", type: "Criatura", atk: 1, hp: 4, subtypes: ["Vampiro"], tags: [], modifiers: [], exhausted: false, summoning: false });
  let result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p142", targetIds: ["dancer"], skipPriority: true }).state;
  assert.equal(hasSubtype(result.players[0].board[0], "Vampiro"), true);
  result.phase = "combate";
  assert.throws(() => executeCommand(result, { type: "attack", owner: 0, attackerId: "dancer", defenderId: "vampire", skipPriority: true }), /invalid-defender/);
});

test("Frenesi grants a second attack and destroys the selected creature at turn end", () => {
  const game = state();
  game.players[0].hand.push(compileCard({ id: "p157", page: 157, name: "Frenesi", type: "Feitiço", cost: 0, text: "", tags: [] }));
  game.players[0].board.push({ uid: "frenzied", name: "Atacante", type: "Criatura", atk: 1, hp: 5, tags: [], modifiers: [], exhausted: false, summoning: false, attackedThisTurn: false });
  game.players[1].life = 30;
  let result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p157", targetIds: ["frenzied"], skipPriority: true }).state;
  result.phase = "combate";
  result = executeCommand(result, { type: "attack", owner: 0, attackerId: "frenzied", skipPriority: true }).state;
  assert.equal(result.players[0].board[0].exhausted, false);
  result = executeCommand(result, { type: "attack", owner: 0, attackerId: "frenzied", skipPriority: true }).state;
  assert.equal(result.players[0].board[0].attackedThisTurn, true);
  result = executeCommand(result, { type: "advancePhase", owner: 0, skipPriority: true }).state;
  assert.equal(result.players[0].board.some((card) => card.uid === "frenzied"), false);
});

test("Café Especial exposes four executable choices", () => {
  const game = state();
  game.players[0].life = 12;
  game.players[0].hand.push(compileCard({ id: "p231", page: 231, name: "Café Especial", type: "Feitiço", cost: 0, text: "", tags: [] }));
  let result = executeCommand(game, { type: "playCard", owner: 0, cardId: "p231", skipPriority: true }).state;
  assert.equal(result.pendingDecision.effect.choices.length, 4);
  result = executeCommand(result, { type: "resolveDecision", owner: 0, choiceIndex: 1 }).state;
  assert.equal(result.players[0].life, 22);
});

test("invalid non-creature intents never open a response window", () => {
  const game = state();
  game.players[0].hand.push({ id: "needs-target", name: "Sem alvo", type: "Feitiço", cost: 0, tags: [], abilities: [{ trigger: "onPlay", effects: [{ type: "damage", amount: 1, target: "anyCreature", selections: 1 }] }] });
  assert.throws(() => executeCommand(game, { type: "playCard", owner: 0, cardId: "needs-target" }, { priority: true }), /invalid-target-count/);
  assert.equal(game.pendingAction, undefined);
  assert.equal(game.pendingResponse, undefined);
});

test("a creature replaces an occupied slot only when all five creature slots are full", () => {
  const game = state();
  game.players[0].hand.push({ id: "replacement", name: "Substituta", type: "Criatura", cost: 0, atk: 1, hp: 1, tags: [], abilities: [] });
  game.players[0].board.push({ uid: "occupied", name: "Ocupada", type: "Criatura", slot: 2, hp: 1, atk: 1, tags: [], abilities: [] });
  assert.throws(() => executeCommand(game, { type: "playCard", owner: 0, cardId: "replacement", slot: 2 }, { priority: true }), /creature-zone-full/);
  for (const slot of [0, 1, 3, 4]) game.players[0].board.push({ uid: `unit-${slot}`, name: "Preenchimento", type: "Criatura", slot, hp: 1, atk: 1, tags: [], abilities: [] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "replacement", slot: 2, skipPriority: true }).state;
  assert.equal(result.players[0].board.find((unit) => unit.slot === 2).name, "Substituta");
  assert.ok(result.players[0].obscuro.some((card) => card.uid === "occupied"));
});

test("legal artifacts stay connected in the support zone after resolution", () => {
  const game = state();
  game.players[0].board.push({ uid: "host", name: "Portadora", type: "Criatura", slot: 1, hp: 2, atk: 2, tags: [], abilities: [] });
  game.players[0].hand.push({ id: "ring", name: "Anel de Teste", type: "Artefato", cost: 0, tags: [], abilities: [] });
  const result = executeCommand(game, { type: "playCard", owner: 0, cardId: "ring", slot: 1, attachedTo: "host", skipPriority: true }).state;
  assert.equal(result.players[0].support.length, 1);
  assert.equal(result.players[0].support[0].attachedTo, "host");
  assert.equal(result.players[0].support[0].slot, 1);
});

test("activated artifact self-destruction resolves after the remaining effects", () => {
  const game = state();
  game.players[0].support.push({
    uid: "self-destructing-artifact", type: "Artefato", page: 304, name: "Artefato de Teste", slot: 0,
    attachedTo: "host", tags: [], modifiers: [],
    abilities: [{ id: "activate", trigger: "activated", costs: [], effects: [
      { type: "destroy", target: "self" },
      { type: "modifyStats", target: "self", attack: 2, health: 1 },
    ] }],
  });
  game.players[0].board.push({ uid: "host", type: "Criatura", slot: 0, tags: [], abilities: [] });
  const result = executeCommand(game, { type: "activate", owner: 0, sourceId: "self-destructing-artifact", abilityId: "activate", skipPriority: true }).state;
  assert.equal(result.players[0].support.length, 0);
  assert.equal(result.players[0].board[0].modifiers[0].attack, 2);
});

test("investigation triggers share reveal events and archive replacement", () => {
  const game = state();
  game.players[0].board.push(
    { uid: "spy", id: "p261", name: "Espião Infiltrado", type: "Criatura", slot: 0, atk: 1, hp: 1, tags: [], modifiers: [], abilities: compileCard({ id: "p261", page: 261, name: "Espião Infiltrado", type: "Criatura", cost: 1, text: "", tags: [] }).abilities },
    { uid: "nmali", id: "p262", name: "Nmali", type: "Criatura", slot: 1, atk: 1, hp: 1, tags: [], modifiers: [], abilities: compileCard({ id: "p262", page: 262, name: "Nmali", type: "Criatura", cost: 1, text: "", tags: [] }).abilities },
  );
  game.players[0].deck.push({ id: "creature-top", name: "Criatura", type: "Criatura" }, { id: "archive", name: "Arquivo", type: "Feitiço" });
  game.players[1].deck.push({ id: "mill", name: "Moinho", type: "Criatura" });
  let result = executeCommand(game, { type: "emit", owner: 0, event: { type: "onCardRevealed", owner: 0, card: { id: "creature-top", type: "Criatura" } } }).state;
  assert.equal(result.players[0].board[0].modifiers[0].attack, 1);
  result = executeCommand(result, { type: "emit", owner: 0, event: { type: "onCardRevealed", owner: 0, card: { id: "spell-top", type: "Feitiço" } } }).state;
  assert.equal(result.players[1].grave.length, 1);
  result = executeCommand(result, { type: "emit", owner: 0, event: { type: "onPlay", owner: 0 } }).state;
  defaultEffectHandlers.archiveToGrave(result, { amount: 1 }, { owner: 0 });
  defaultEffectHandlers.investigate(result, { amount: 2, target: "controllerDeck" }, { owner: 0, sourceId: "spy" });
  assert.ok(result.players[0].grave.some((card) => card.id === "archive"));
});

test("Brutamontes only gains attack for creatures explicitly sacrificed", () => {
  const game=state(); game.players[0].board.push({uid:"ally",id:"ally",name:"Aliada",type:"Criatura",slot:0,hp:2,tags:[],abilities:[]}); game.players[0].hand.push(compileCard({id:"p117",page:117,name:"Brutamontes",type:"Criatura",cost:0,atk:1,hp:4,text:"",tags:[]}));
  const pending=executeCommand(game,{type:"playCard",owner:0,cardId:"p117",instanceId:"brute",slot:1}).state; assert.equal(pending.pendingDecision.kind,"optional-sacrifice-buff");
  const resolved=executeCommand(pending,{type:"resolveDecision",owner:0,targetIds:["ally"]}).state; assert.equal(resolved.players[0].board.find(card=>card.uid==="brute").modifiers[0].attack,2); assert.ok(resolved.players[0].grave.some(card=>card.id==="ally"));
});

test("Brutamontes may decline every sacrifice and stays at base attack", () => {
  const game=state(); game.players[0].board.push({uid:"ally",id:"ally",type:"Criatura",slot:0,hp:2,tags:[],abilities:[]}); game.players[0].hand.push(compileCard({id:"p117",page:117,name:"Brutamontes",type:"Criatura",cost:0,atk:1,hp:4,text:"",tags:[]}));
  const pending=executeCommand(game,{type:"playCard",owner:0,cardId:"p117",instanceId:"brute",slot:1}).state; const resolved=executeCommand(pending,{type:"resolveDecision",owner:0,targetIds:[]}).state; assert.equal(resolved.players[0].board.find(card=>card.uid==="brute").modifiers.length,0);
});

test("Caneca da Sorte grants one modifier and Magic Barrier to Recruta Pinguço", () => {
  const game=state(); game.players[0].board.push({uid:"pinguco",id:"p189",page:189,name:"Recruta Pinguço",type:"Criatura",slot:0,atk:2,hp:2,tags:[],modifiers:[],abilities:[]}); game.players[0].hand.push(compileCard({id:"p192",page:192,name:"Caneca da Sorte",type:"Artefato",cost:0,text:"",tags:[]}));
  const result=executeCommand(game,{type:"playCard",owner:0,cardId:"p192",instanceId:"mug",slot:0,attachedTo:"pinguco"}).state; const host=result.players[0].board[0]; assert.equal(host.modifiers.length,1); assert.deepEqual([host.modifiers[0].attack,host.modifiers[0].health],[2,-1]); assert.ok(host.grantedKeywords.some(value=>/barreira mágica/i.test(value)));
});

test("zero vitality from a modifier sends a reset card to grave", () => {
  const game=state(); game.cardCatalog=[{id:"base",page:999,name:"Nome Base",type:"Criatura",cost:1,atk:1,hp:1,text:"",tags:[],abilities:[]}]; game.players[0].board.push({uid:"mutated",id:"instance",page:999,name:"Nome Alterado",type:"Criatura",slot:0,atk:9,hp:1,damage:0,tags:["Virada"],exhausted:true,modifiers:[],abilities:[]}); game.players[0].hand.push(compileCard({id:"p192",page:192,name:"Caneca da Sorte",type:"Artefato",cost:0,text:"",tags:[]}));
  const result=executeCommand(game,{type:"playCard",owner:0,cardId:"p192",instanceId:"mug",slot:0,attachedTo:"mutated"}).state; const dead=result.players[0].grave.find(card=>card.page===999); assert.equal(result.players[0].board.length,0); assert.equal(dead.name,"Nome Base"); assert.deepEqual(dead.tags,[]); assert.equal(dead.modifiers,undefined);
});

test("Fura-Fila compiles to the canonical previous-card condition", () => {
  const compiled = compileCardText("Fura-Fila: Compre 1 carta.");
  assert.deepEqual(compiled.abilities[0].condition, { cardsPlayedBeforeThisAtLeast: 1 });
});

test("accelerated spells spend reserve first on own turn and only reserve on opponent turn", () => {
  const own = state(); own.players[0].energy = 3; own.players[0].reserve = 2; own.players[0].hand.push({ id:"fast", name:"Fast", type:"Feitiço", cost:3, tags:["Acelerado"], abilities:[] });
  const ownResult = executeCommand(own,{type:"playCard",owner:0,cardId:"fast"}).state;
  assert.deepEqual([ownResult.players[0].energy,ownResult.players[0].reserve],[2,0]);
  const response = state(); response.active=0; response.players[1].energy=10; response.players[1].reserve=2; response.players[1].hand.push({ id:"fast", name:"Fast", type:"Feitiço", cost:3, tags:["Acelerado"], abilities:[] });
  assert.throws(()=>executeCommand(response,{type:"playCard",owner:1,cardId:"fast",hasPriority:true}),/not-enough-energy/);
});

test("spell keywords apply Lifesteal and Deathtouch to effect damage", () => {
  const game=state(); game.players[0].life=20; game.players[1].board.push({uid:"target",id:"target",type:"Criatura",slot:0,hp:9,damage:0,tags:[],modifiers:[],abilities:[]});
  defaultEffectHandlers.damage(game,{type:"damage",amount:1},{owner:0,sourceId:"spell",effectSource:{id:"spell",type:"Feitiço",tags:["Roubo de Vida","Toque da Morte"]},targetIds:["target"]});
  assert.equal(game.players[0].life,21); assert.equal(game.players[1].board[0].damage,9);
});

test("paying life is an atomic cost and publishes the life-loss trigger", () => {
  const game=state(); game.players[0].life=2; game.players[0].heroId="saymon"; game.players[0].level=2; game.players[0].heroXP=0;
  game.players[0].board.push(
    {uid:"listener",id:"listener",name:"Discípulo",type:"Criatura",slot:0,atk:1,hp:2,tags:[],modifiers:[],abilities:[{id:"blood",trigger:"onLifeLost",effects:[{type:"modifyStats",target:"self",attack:1,health:0,duration:"turn"}]}]},
    {uid:"payer",id:"payer",name:"Olhos Sangrentos",type:"Criatura",slot:1,atk:2,hp:2,tags:[],modifiers:[],abilities:[{id:"pay",trigger:"activated",costs:[{type:"life",amount:2}],effects:[{type:"grantKeyword",target:"self",keyword:"Veloz",duration:"turn"}],usageLimit:{count:1,period:"turn"}}]},
  );
  const result=executeCommand(game,{type:"activate",owner:0,sourceId:"payer",abilityId:"pay"}).state;
  assert.equal(result.players[0].life,0); assert.equal(result.players[0].heroXP,1); assert.equal(result.players[0].lifeLostThisTurn,2);
  assert.equal(result.players[0].board.find(card=>card.uid==="listener").modifiers[0].attack,1);
  assert.ok(result.players[0].board.find(card=>card.uid==="payer").temporaryTags.includes("Veloz"));
});

test("Saymon level 3 life costs can never reduce life below one", () => {
  const card={id:"p138",page:138,name:"Olhos Sangrentos",type:"Criatura",cost:0,text:"",tags:[],abilities:[]};
  assert.equal(canActivateCard(card,{life:2,heroId:"saymon",heroLevel:2}),true);
  assert.equal(canActivateCard(card,{life:2,heroId:"saymon",heroLevel:3}),false);
  const compiled=compileCard(card),game=state(); game.players[0].life=2; game.players[0].heroId="saymon"; game.players[0].level=3; game.players[0].board.push({...compiled,uid:"payer",slot:0});
  assert.throws(()=>executeCommand(game,{type:"activate",owner:0,sourceId:"payer",abilityId:compiled.abilities[0].id}),/not-enough-life/);
});

test("every generated card is executable by the authoritative engine", async () => {
  const cards = JSON.parse(await readFile(new URL("../app/cards.generated.json", import.meta.url), "utf8")).map(compileCard);
  assert.deepEqual(cards.filter((card) => !canExecuteCard(card)).map((card) => card.id), []);
});

test("Goblin sacrifice damage uses the sacrificed creature effective attack", () => {
  const game = state(); game.players[0].energy = 10;
  const source = compileCard({ id: "p37", page: 37, name: "BUCHA DE CANHÃO", type: "Encanto", cost: 0, text: "", tags: [] });
  game.players[0].support.push({ ...source, uid: "cannon", slot: 0, summoning: false, exhausted: false });
  game.players[0].board.push({ uid: "goblin", id: "goblin", type: "Criatura", atk: 3, hp: 2, tags: ["Goblin"], subtypes: ["Goblin"], modifiers: [{ attack: 2, health: 0 }], abilities: [] });
  game.players[1].board.push({ uid: "target", id: "target", type: "Criatura", atk: 0, hp: 8, damage: 0, tags: [], modifiers: [], abilities: [] });
  const result = executeCommand(game, { type: "activate", owner: 0, sourceId: "cannon", abilityId: source.abilities[0].id, sacrificeIds: ["goblin"], targetIds: ["target"] }).state;
  assert.equal(result.players[1].board[0].damage, 5);
  assert.equal(result.players[0].grave[0].deathCause, "sacrifice");
});

test("Chave Rara searches a terrain directly onto the authoritative field", () => {
  const game = state(); game.players[0].energy = 10;
  const card = compileCard({ id: "p94", page: 94, name: "Chave Rara", type: "Feitiço", cost: 3, text: "", tags: [] });
  game.players[0].hand.push(card); game.players[0].deck.push({ id: "terrain", page: 204, name: "Círculo", type: "Terreno", cost: 5, text: "", tags: [], abilities: [] });
  const pending = executeCommand(game, { type: "playCard", owner: 0, cardId: "p94" }).state;
  assert.equal(pending.pendingDecision.kind, "search");
  const result = executeCommand(pending, { type: "resolveDecision", owner: 0, selectedCardIds: ["terrain"] }).state;
  assert.equal(result.players[0].terrain.id, "terrain");
  assert.equal(result.players[0].deck.length, 0);
});

test("Desenterrar validates its grave choice and resumes by resurrecting it", () => {
  const game = state(); game.players[0].energy = 10;
  const card = compileCard({ id: "p102", page: 102, name: "Desenterrar", type: "Feitiço", cost: 3, text: "", tags: [] });
  game.players[0].hand.push(card); game.players[0].grave.push({ id: "dead", page: 1, name: "Morto", type: "Criatura", cost: 5, atk: 4, hp: 4, text: "", tags: [], abilities: [] });
  const pending = executeCommand(game, { type: "playCard", owner: 0, cardId: "p102" }).state;
  assert.equal(pending.pendingDecision.kind, "zone-card");
  const result = executeCommand(pending, { type: "resolveDecision", owner: 0, selectedCardId: "dead" }).state;
  assert.equal(result.players[0].board[0].id, "dead");
  assert.equal(result.players[0].grave.length, 1); // Desenterrar itself.
});

test("Café Pingado prevents exactly one point instead of the whole damage instance", () => {
  const game = state(); game.players[0].energy = 10;
  const card = compileCard({ id: "p236", page: 236, name: "Café Pingado", type: "Feitiço", cost: 1, text: "", tags: [] });
  game.players[0].hand.push(card); game.players[0].board.push({ uid: "target", id: "target", type: "Criatura", atk: 1, hp: 5, damage: 0, tags: [], modifiers: [], abilities: [] });
  const protectedState = executeCommand(game, { type: "playCard", owner: 0, cardId: "p236", targetIds: ["target"] }).state;
  const damaged = executeCommand(protectedState, { type: "emit", event: { type: "test" } }, { handlers: { testDamage(state) {} } }).state;
  defaultEffectHandlers.damage(damaged, { type: "damage", amount: 3 }, { owner: 1, sourceId: "spell", targetIds: ["target"] });
  assert.equal(damaged.players[0].board[0].damage, 2);
});

test("Prestidigitação lets its controller draw from the bottom", () => {
  const game = state(); game.players[0].support.push({ uid: "presto", page: 271, type: "Encanto", abilities: [], suffocated: false }); game.players[0].deck.push({ id: "top" }, { id: "bottom" });
  defaultEffectHandlers.draw(game, { type: "draw", amount: 1 }, { owner: 0, sourceId: "draw" });
  assert.equal(game.pendingDecision.kind, "draw-position");
  const result = executeCommand(game, { type: "resolveDecision", owner: 0, choiceIndex: 1 }).state;
  assert.equal(result.players[0].hand[0].id, "bottom");
});

test("Tessália AI never queues an illegal non-commander attack", () => {
  const player = { heroId: "tessalia", board: [{ uid: "wing", slot: 0, atk: 4, exhausted: false, summoning: false, stunned: false, immobilized: false }] };
  assert.deepEqual(legalAIAttackers(player), []);
  assert.equal(preferredAISlot(player), 2);
  player.board.push({ uid: "commander", slot: 2, atk: 2, exhausted: false, summoning: false, stunned: false, immobilized: false });
  assert.deepEqual(orderAIAttackers(player, "Difícil").map((unit) => unit.uid), ["commander", "wing"]);
});

test("authoritative combat enforces Tessália commander restriction", () => {
  const game = state(); game.phase = "combate"; game.players[0].heroId = "tessalia";
  game.players[0].board.push({ uid: "wing", slot: 0, type: "Criatura", atk: 3, hp: 3, exhausted: false, summoning: false, stunned: false, tags: [], abilities: [] });
  assert.throws(() => executeCommand(game, { type: "declareAttack", owner: 0, attackerId: "wing" }), /invalid-attacker/);
  game.players[0].board.push({ uid: "commander", slot: 2, type: "Criatura", atk: 1, hp: 3, exhausted: true, summoning: false, stunned: false, tags: [], abilities: [] });
  assert.equal(executeCommand(game, { type: "declareAttack", owner: 0, attackerId: "wing" }).state.combatAction.attackerUid, "wing");
});

test("Saymon evolution markers expire when his next turn starts", () => {
  const game = state(); game.phase = "fim"; game.active = 0; game.players[1].heroId = "saymon"; game.players[1].heroXP = 5; game.players[1].lifeLossEvents = 5; game.players[1].lifeLostThisTurn = 8;
  const result = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(result.active, 1); assert.equal(result.players[1].heroXP, 0); assert.equal(result.players[1].lifeLossEvents, 0); assert.equal(result.players[1].lifeLostThisTurn, 0);
});

test("AI difficulty profiles and life-cost safety are explicit", () => {
  assert.deepEqual([aiDifficultyProfile("Fácil").cardBudget, aiDifficultyProfile("Normal").cardBudget, aiDifficultyProfile("Difícil").cardBudget], [1, 2, 3]);
  assert.equal(canAIPlayLifeCost({ text: "Perca 3 de vida." }, { life: 2, heroId: "saymon", level: 2 }), false);
  assert.equal(canAIPlayLifeCost({ text: "Perca 1 de vida." }, { life: 2, heroId: "saymon", level: 3 }), true);
});


test("UI animation is presentation-only and cannot hide an unresolved ability response", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /Aguarde a animação atual terminar/);
  assert.doesNotMatch(page, /responseWindow\?\.action\.startsWith\("habilidade de "\).*setResponseWindow\(null\)/);
  assert.doesNotMatch(page, /window\.setTimeout\(\(\)=>update\(next=>/);
  assert.match(page, /Rules resolve atomically/);
});

test("online actions share one serialized request queue and reconcile stale revisions", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /syncQueueRef\.current\.then\(\(\)=>execute\(\)\)/);
  assert.match(page, /res\.status===409&&data\?\.game/);
  assert.match(page, /if\(retry&&action==="command"\)return execute\(false\)/);
  assert.match(page, /incomingRevision<=roomRevisionRef\.current/);
});

test("field keyword icons render outside the card button at its lower edge", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/lab-legacy.css", import.meta.url), "utf8");
  const buttonClose = page.indexOf("</button>", page.indexOf("function OriginalCard"));
  const keywordStrip = page.indexOf('className="field-keywords"', page.indexOf("function OriginalCard"));
  assert.ok(keywordStrip > buttonClose);
  assert.match(css, /\.card-frame>\.field-keywords\{[\s\S]*bottom:-18px!important/);
});

test("a full priority combat exchange always reaches a terminal combat state", () => {
  const game = state(); game.phase = "combate";
  game.players[0].board.push({ uid: "a", type: "Criatura", slot: 0, atk: 2, hp: 3, damage: 0, exhausted: false, summoning: false, stunned: false, tags: [], abilities: [] });
  game.players[1].board.push({ uid: "d", type: "Criatura", slot: 0, atk: 1, hp: 3, damage: 0, exhausted: false, summoning: false, stunned: false, tags: [], abilities: [] });
  let next = executeCommand(game, { type: "declareAttack", owner: 0, attackerId: "a" }, { priority: true }).state;
  for (const owner of [1, 0]) next = executeCommand(next, { type: "passPriority", owner }, { priority: true }).state;
  next = executeCommand(next, { type: "selectDefender", owner: 1, attackerId: "a", defenderId: "d", targetHero: false }, { priority: true }).state;
  next = executeCommand(next, { type: "attack", owner: 0, attackerId: "a", defenderId: "d", skipPriority: true }, { priority: true }).state;
  assert.equal(next.combatAction, null);
  assert.equal(next.pendingResponse, null);
  assert.equal(next.pendingAction, undefined);
});


test("game viewport and stage use the canonical responsive shell", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(layout, /export const viewport:\s*Viewport/);
  assert.match(layout, /width:\s*"device-width"/);
  assert.match(layout, /initialScale:\s*1/);
  assert.match(layout, /maximumScale:\s*1/);
  assert.match(layout, /userScalable:\s*false/);
  assert.match(page, /className="game-stage"/);
  assert.match(page, /className="hs-board game-content"/);
  assert.doesNotMatch(page, /--hand-card-size/);
});

test("board layout preserves the approved 16:9 composition proportionally", async () => {
  const css = await readFile(new URL("../app/board-layout.css", import.meta.url), "utf8");
  assert.match(css, /\.screen-game \.game-stage > \.game-content\.hs-board/);
  assert.match(css, /display:\s*grid\s*!important/);
  assert.match(css, /aspect-ratio:\s*16\s*\/\s*9\s*!important/);
  assert.match(css, /width:\s*min\(100dvw,\s*calc\(100dvh \* 16 \/ 9\)\)\s*!important/);
  assert.match(css, /grid-template-columns:[\s\S]*minmax\(0, 58fr\)/);
  assert.match(css, /container-type:\s*size/);
  assert.doesNotMatch(css, /\d+px/);
});

test("cards, fields, piles and hand remain proportional without coordinate reflow", async () => {
  const [board, lab] = await Promise.all([
    readFile(new URL("../app/board-layout.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lab.css", import.meta.url), "utf8"),
  ]);
  const css = board + "\n" + lab;
  assert.match(css, /--hh-slot-w:\s*clamp\([^;]*4cqw/);
  assert.match(css, /--hh-card-ratio:\s*5\s*\/\s*7/);
  assert.match(css, /\.hs-board > \.paired-field\s*\{[\s\S]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.hs-board > \.side-piles\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0,1fr\)\)/);
  assert.match(css, /\.hs-board > \.player-hand\s*\{[\s\S]*overflow-x:\s*auto\s*!important/);
  assert.match(css, /@container hemsfell-board \(max-height: 44rem\)/);
  assert.doesNotMatch(board, /grid-template-columns:minmax\(7\.5rem/);
});

test("final stage seal outranks legacy fixed-position board rules", async () => {
  const [lab, board, interaction] = await Promise.all([
    readFile(new URL("../app/lab.css", import.meta.url), "utf8"),
    readFile(new URL("../app/board-layout.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lab-interaction-responsive.css", import.meta.url), "utf8"),
  ]);
  assert.match(lab, /@import "\.\/board-layout\.css"/);
  assert.match(lab, /@import "\.\/board-tuning\.css"/);
  assert.match(lab, /@import "\.\/lab-interaction-responsive\.css"/);
  assert.match(lab, /\.screen-game \.game-stage > \.game-content\.hs-board > \.side-piles\s*\{[\s\S]*position:\s*relative\s*!important/);
  assert.match(lab, /left:\s*auto\s*!important/);
  assert.match(lab, /transform:\s*none\s*!important/);
  assert.match(board, /\.screen-game \.hs-board > \.paired-field/);
  assert.match(interaction, /\.visual-effect[\s\S]*z-index:\s*62\s*!important/);
  assert.doesNotMatch(board, /\d+px/);
});



test("single eligible Draconic Illusion replacement auto-selects", () => {
  const game = state(); game.round = 3;
  const young = { uid: "young", id: "young", name: "Dragão Jovem", type: "Criatura", slot: 2, generatedImage: true, imageCard: true, summoning: false, exhausted: false, damage: 0, tags: [], abilities: [] };
  game.players[0].board.push(young);
  game.players[0].extraDeck = [compileCard({ id: "p25", page: 25, name: "Dragão Ancião", type: "Criatura", cost: 0, text: "" })];
  defaultEffectHandlers.replaceImage(game, { type: "replaceImage", oldName: "Dragão Jovem", newName: "Dragão Ancião" }, { owner: 0, sourceId: "illusion" });
  assert.equal(game.pendingDecision, undefined);
  assert.equal(game.players[0].board.some((card) => card.name === "Dragão Jovem"), false);
  assert.equal(game.players[0].board.some((card) => card.name === "Dragão Ancião"), true);
});

test("Dragão Ancião First Act applies primary and adjacent damage after target selection", () => {
  const game = state();
  const ancient = { ...compileCard({ id: "p25", page: 25, name: "Dragão Ancião", type: "Criatura", cost: 0, text: "" }), uid: "ancient", slot: 0, generatedImage: true, imageCard: true, summoning: true, exhausted: false, damage: 0 };
  game.players[0].board.push(ancient);
  game.players[1].board.push(
    { uid: "left", id: "left", type: "Criatura", name: "Left", slot: 1, atk: 1, hp: 6, damage: 0, tags: [], abilities: [], exhausted: false, summoning: false },
    { uid: "center", id: "center", type: "Criatura", name: "Center", slot: 2, atk: 1, hp: 5, damage: 0, tags: [], abilities: [], exhausted: false, summoning: false },
    { uid: "right", id: "right", type: "Criatura", name: "Right", slot: 3, atk: 1, hp: 6, damage: 0, tags: [], abilities: [], exhausted: false, summoning: false }
  );
  const pending = executeCommand(game, { type: "emit", event: { type: "onEnter", owner: 0, sourceId: "ancient", cardId: "ancient", card: ancient } }).state;
  assert.equal(pending.pendingDecision?.sourceName, "Dragão Ancião");
  const resolved = executeCommand(pending, { type: "resolveDecision", owner: 0, targetIds: ["center"] }).state;
  assert.equal(resolved.players[1].board.some((card) => card.uid === "center"), false);
  assert.equal(resolved.players[1].board.find((card) => card.uid === "left")?.damage, 2);
  assert.equal(resolved.players[1].board.find((card) => card.uid === "right")?.damage, 2);
});

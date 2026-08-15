import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { buildAIActionCandidates, chooseAIDecision, chooseAIHeroAbility, chooseAITargetIds, completeAIPlayCommand } from "../app/rules-engine/ai.mjs";

const player = (heroId = "uruk") => ({ heroId, level: 1, levelUpsThisTurn: 0, life: 30, maxLife: 30, energy: 10, maxEnergy: 10, reserve: 3, deck: [], extraDeck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [], abilityUses: {}, nextElementEffects: [], turnCardsPlayed: 0, turnSpellsPlayed: 0, spellsPlayed: 0 });
const state = () => ({ active: 1, phase: "principal", round: 3, events: 0, cardCatalog: cards.map(compileCard), players: [player("gimble"), player()] });
const printed = (page, overrides = {}) => compileCard({ ...cards.find((card) => card.page === page), ...overrides });
const unit = (id, overrides = {}) => ({ uid: id, id, name: id, type: "Criatura", cost: 1, atk: 2, hp: 3, text: "", tags: [], abilities: [], slot: 0, damage: 0, modifiers: [], exhausted: false, summoning: false, ...overrides });

test("bot escolhe alvos válidos, distintos e alinhados à intenção do efeito", () => {
  const game = state(); game.players[0].board.push(unit("enemy-a"), unit("enemy-b", { slot: 1 })); game.players[1].board.push(unit("ally"));
  const source = printed(56); const steps = [{ scope: "anyCreature" }, { scope: "anyCreature", optional: true }];
  assert.deepEqual(chooseAITargetIds(game, 1, steps, source, "Difícil"), ["enemy-a", "enemy-b"]);
});

test("bot completa Orbe, Punho, Maestria e Artefato com todos os parâmetros obrigatórios", () => {
  const game = state(); game.players[0].board.push(unit("enemy-a"), unit("enemy-b", { slot: 1 })); game.players[1].board.push(unit("host"));
  game.players[1].extraDeck = [71, 72, 73, 74, 81].map((page) => printed(page));
  const orb = completeAIPlayCommand(game, 1, printed(55, { cost: 0 }), "Difícil");
  assert.equal(orb.chosenElement, "Fogo"); assert.deepEqual(orb.targetIds, ["enemy-a"]);
  const fist = completeAIPlayCommand(game, 1, printed(56, { cost: 0 }), "Difícil");
  assert.equal(fist.targetIds.length, 2); assert.equal(new Set(fist.targetIds).size, 2);
  const mastery = completeAIPlayCommand(game, 1, printed(70, { cost: 0 }), "Difícil");
  assert.match(mastery.selectedImageName, /^Maestria Elemental:/);
  const artifact = completeAIPlayCommand(game, 1, { id: "artifact", name: "Artefato", type: "Artefato", cost: 0, text: "", tags: [], abilities: [] });
  assert.equal(artifact.attachedTo, "host"); assert.equal(artifact.slot, 0);
});

test("resolvedor cobre escolhas de busca, mão, cemitério, alvo e descarte obrigatório", () => {
  const game = state(); game.players[1].deck = [printed(62), printed(65)]; game.players[1].hand = [printed(55), printed(56), printed(57)]; game.players[1].grave = [printed(76)]; game.players[0].board.push(unit("enemy"));
  game.pendingDecision = { kind: "search", owner: 1, effect: { amount: 1, destination: "hand", types: ["Feitiço"] }, context: {} };
  assert.equal(chooseAIDecision(game, 1).selectedCardIds.length, 1);
  game.pendingDecision = { kind: "hand-limit-discard", owner: 1, effect: { amount: 2 }, context: {} };
  assert.equal(chooseAIDecision(game, 1).selectedCardIds.length, 2);
  game.pendingDecision = { kind: "zone-card", owner: 1, effect: { choices: ["p76"] }, context: {} };
  assert.equal(chooseAIDecision(game, 1).selectedCardId, "p76");
  game.pendingDecision = { kind: "choice-target", owner: 1, effect: { choices: [[{ type: "damage" }]], optional: true }, context: { effectSource: { text: "Cause dano" } }, targetSteps: [{ scope: "anyCreature" }] };
  assert.deepEqual(chooseAIDecision(game, 1, "Difícil").targetIds, ["enemy"]);
});

test("planejador tenta somente comandos aceitos e sempre mantém uma saída de fase", () => {
  const game = state(); game.players[0].board.push(unit("enemy")); game.players[1].hand = [printed(55, { cost: 0 }), printed(56, { cost: 0 }), printed(60, { cost: 0 })];
  const candidates = buildAIActionCandidates(game, 1, "Difícil");
  assert.ok(candidates.some((command) => command.type === "playCard"));
  assert.equal(candidates.at(-1).type, "advancePhase");
  assert.ok(candidates.some((command) => { try { executeCommand(structuredClone(game), { ...command, skipPriority: true }); return true; } catch { return false; } }));
});

test("poderes ativos dos heróis também entram no planejamento do bot", () => {
  const game = state(); game.players[1].heroId = "saymon"; game.players[1].level = 2; game.players[1].life = 20; game.players[1].board.push(unit("vampire", { atk: 5 })); game.players[0].board.push(unit("victim", { hp: 1 }));
  assert.deepEqual(chooseAIHeroAbility(game, 1, "Difícil"), { kind: "saymon-lifesteal", slot: 1, targetId: "vampire" });
  game.players[1].abilityUses["saymon-1"] = 1;
  assert.deepEqual(chooseAIHeroAbility(game, 1, "Difícil"), { kind: "saymon-damage", slot: 0, targetId: "victim" });
});

test("bot recognizes both active Ngoro clue powers", () => {
  const game = state(); game.players[1].heroId = "ngoro"; game.players[1].level = 3; game.players[1].heroXP = 3; game.players[1].board.push(unit("agent", { atk: 4 }));
  assert.deepEqual(chooseAIHeroAbility(game, 1, "Difícil"), { kind: "ngoro-stealth", slot: 2, targetId: "agent" });
  game.players[1].abilityUses["ngoro-2"] = 1;
  assert.deepEqual(chooseAIHeroAbility(game, 1, "Difícil"), { kind: "ngoro-clue-action", slot: 1 });
});

test("simulação adversarial resolve prioridades e decisões sem ciclo ou travamento", () => {
  let game = state(); game.players[0].board.push(unit("enemy")); game.players[1].hand = [printed(55, { cost: 0 }), printed(56, { cost: 0 }), printed(60, { cost: 0 })];
  const fingerprints = new Map();
  for (let step = 0; step < 80 && game.active === 1; step++) {
    const fingerprint = JSON.stringify([game.phase, game.pendingDecision?.kind, game.pendingResponse?.responder, game.players[1].hand.length, game.players[1].turnCardsPlayed, game.players[0].board.map((card) => [card.uid, card.damage])]);
    fingerprints.set(fingerprint, (fingerprints.get(fingerprint) || 0) + 1); assert.ok(fingerprints.get(fingerprint) < 5, `ciclo detectado em ${fingerprint}`);
    if (game.pendingResponse) { game = executeCommand(game, { type: "passPriority", owner: game.pendingResponse.responder }).state; continue; }
    if (game.pendingDecision) { const decision = chooseAIDecision(game, 1, "Difícil"); assert.ok(decision, `decisão sem saída: ${game.pendingDecision.kind}`); game = executeCommand(game, decision).state; continue; }
    const command = buildAIActionCandidates(game, 1, "Difícil").find((candidate) => { try { executeCommand(structuredClone(game), { ...candidate, skipPriority: true }); return true; } catch { return false; } });
    assert.ok(command, `fase sem comando: ${game.phase}`); game = executeCommand(game, { ...command, skipPriority: true }).state;
  }
  assert.notEqual(game.active, 1, "o bot deve conseguir concluir o turno");
});

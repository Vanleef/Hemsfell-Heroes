import assert from "node:assert/strict";
import test from "node:test";
import { aiDifficultyProfile } from "../app/rules-engine/ai.mjs";
import { competitiveStateValue, normalizeCompetitiveDifficulty, rankPriorityResponses } from "../app/rules-engine/competitive-ai-runtime.mjs";

const card = (id, overrides = {}) => ({ id, name: id, type: "Feitiço", cost: 2, text: "", tags: [], subtypes: [], ...overrides });
const player = (heroId = "gimble") => ({ heroId, level: 1, life: 30, maxLife: 30, energy: 3, maxEnergy: 3, reserve: 2, hand: [], deck: [], board: [], support: [], terrain: null, grave: [], obscuro: [], abilityUses: {}, turnCardsPlayed: 0 });
const state = () => ({ active: 1, phase: "principal", round: 3, winner: null, players: [player("uruk"), player("gimble")] });

test("competitive AI exposes all five difficulty tiers with increasing search quality", () => {
  const previous = globalThis.__HEMSFELL_AI_DIFFICULTY__;
  try {
    const levels = ["Fácil", "Normal", "Difícil", "Expert", "Master"];
    const profiles = levels.map(level => {
      globalThis.__HEMSFELL_AI_DIFFICULTY__ = level;
      return aiDifficultyProfile("Normal");
    });
    assert.deepEqual(profiles.map(profile => profile.id), ["Easy", "Normal", "Hard", "Expert", "Master"]);
    assert.deepEqual(profiles.map(profile => profile.cardBudget), [1, 2, 3, 4, 5]);
    assert.ok(profiles.every((profile, index) => index === 0 || profile.particleCount > profiles[index - 1].particleCount));
    assert.equal(normalizeCompetitiveDifficulty("Difícil"), "Hard");
  } finally {
    globalThis.__HEMSFELL_AI_DIFFICULTY__ = previous;
  }
});

test("public evaluation does not read the real partition of an unrevealed opponent hand", () => {
  const previous = globalThis.__HEMSFELL_AI_DIFFICULTY__;
  globalThis.__HEMSFELL_AI_DIFFICULTY__ = "Master";
  try {
    const dangerous = card("danger", { cost: 7, text: "Acelerado. Cause 12 de dano.", tags: ["Acelerado"] });
    const harmless = card("harmless", { cost: 1, text: "" });
    const first = state(); first.players[0].hand = [dangerous]; first.players[0].deck = [harmless];
    const second = state(); second.players[0].hand = [harmless]; second.players[0].deck = [dangerous];
    assert.equal(competitiveStateValue(first, 1, "Master"), competitiveStateValue(second, 1, "Master"));
  } finally {
    globalThis.__HEMSFELL_AI_DIFFICULTY__ = previous;
  }
});

test("high difficulty uses a meaningful accelerated answer instead of blindly passing a dangerous priority", () => {
  const previous = globalThis.__HEMSFELL_AI_DIFFICULTY__;
  globalThis.__HEMSFELL_AI_DIFFICULTY__ = "Master";
  try {
    const game = state();
    game.pendingResponse = { responder: 1, actor: 0, passes: 0, action: "ataque com dano letal" };
    game.players[1].hand = [card("answer", { cost: 1, text: "Acelerado. Cause 3 de dano.", tags: ["Acelerado"] })];
    const legal = [{ type: "playCard", owner: 1, cardId: "answer", handIndex: 0, hasPriority: true }];
    const chosen = rankPriorityResponses(game, 1, legal, "Master", () => .5);
    assert.equal(chosen.type, "playCard");
    assert.equal(chosen.cardId, "answer");
  } finally {
    globalThis.__HEMSFELL_AI_DIFFICULTY__ = previous;
  }
});

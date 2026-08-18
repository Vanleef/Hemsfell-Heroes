import * as legacy from "./ai-legacy.mjs";
import { competitiveDifficultyProfile, effectiveAIDifficulty, legacyDifficulty, rankCompetitiveCandidates } from "./competitive-ai-runtime.mjs";

export const aiDifficultyProfile = (difficulty = "Normal") => competitiveDifficultyProfile(difficulty);
export const isReadyAttacker = legacy.isReadyAttacker;
export const hasTessaliaCommander = legacy.hasTessaliaCommander;
export const legalAIAttackers = legacy.legalAIAttackers;
export const preferredAISlot = legacy.preferredAISlot;
export const canAIPlayLifeCost = legacy.canAIPlayLifeCost;
export const legalAITargets = legacy.legalAITargets;
export const chooseAITargetIds = legacy.chooseAITargetIds;

export function orderAIAttackers(player, difficulty = "Normal") {
  return legacy.orderAIAttackers(player, legacyDifficulty(difficulty));
}

export function chooseAIPlayable(playable, player, opponent, difficulty = "Normal", random = Math.random) {
  return legacy.chooseAIPlayable(playable, player, opponent, legacyDifficulty(difficulty), random);
}

export function aiCardValue(card, state, owner, difficulty = "Normal") {
  return legacy.aiCardValue(card, state, owner, legacyDifficulty(difficulty));
}

export function chooseAIDecision(state, owner, difficulty = "Normal") {
  return legacy.chooseAIDecision(state, owner, legacyDifficulty(difficulty));
}

export function completeAIPlayCommand(state, owner, card, difficulty = "Normal", options = {}) {
  return legacy.completeAIPlayCommand(state, owner, card, legacyDifficulty(difficulty), options);
}

function simulationCandidates(state, owner, requested) {
  if (state?.pendingResponse?.responder === owner) return [{ type: "passPriority", owner, auto: true }];
  return legacy.buildAIActionCandidates(state, owner, legacyDifficulty(requested));
}

export function buildAIActionCandidates(state, owner, difficulty = "Normal") {
  const requested = effectiveAIDifficulty(difficulty);
  const raw = legacy.buildAIActionCandidates(state, owner, legacyDifficulty(requested));
  return rankCompetitiveCandidates(state, owner, raw, requested, {
    generate: (next, actor) => simulationCandidates(next, actor, requested),
  });
}

export function chooseValidatedAIAction(state, owner, validate, difficulty = "Normal") {
  for (const command of buildAIActionCandidates(state, owner, difficulty)) {
    try { if (!validate || validate(command)) return command; } catch { /* keep searching */ }
  }
  return state?.active === owner && !state?.pendingDecision ? { type: "advancePhase", owner } : null;
}

export function chooseAIHeroAbility(state, owner, difficulty = "Normal") {
  return legacy.chooseAIHeroAbility(state, owner, legacyDifficulty(difficulty));
}

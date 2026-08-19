import type { AIDifficulty, DifficultyConfig } from "./types";

export const DIFFICULTY_CONFIG: Record<AIDifficulty, DifficultyConfig> = {
  Easy: {
    iterations: 0,
    thinkTimeMs: 120,
    particleCount: 6,
    rolloutDepth: 2,
    heuristicRolloutChance: 1,
    explorationConstant: 1.8,
    intentionalErrorRate: 0.28,
    evaluationNoise: 0.18,
    opponentModelStrength: 0.2,
    yieldEvery: 8,
  },
  Normal: {
    iterations: 80,
    thinkTimeMs: 260,
    particleCount: 18,
    rolloutDepth: 4,
    heuristicRolloutChance: 0.7,
    explorationConstant: Math.SQRT2,
    intentionalErrorRate: 0.1,
    evaluationNoise: 0.08,
    opponentModelStrength: 0.45,
    yieldEvery: 12,
  },
  Hard: {
    iterations: 240,
    thinkTimeMs: 520,
    particleCount: 42,
    rolloutDepth: 6,
    heuristicRolloutChance: 0.72,
    explorationConstant: 1.25,
    intentionalErrorRate: 0.035,
    evaluationNoise: 0.03,
    opponentModelStrength: 0.7,
    yieldEvery: 18,
  },
  Expert: {
    iterations: 700,
    thinkTimeMs: 900,
    particleCount: 96,
    rolloutDepth: 8,
    heuristicRolloutChance: 0.78,
    explorationConstant: 1.08,
    intentionalErrorRate: 0.01,
    evaluationNoise: 0.012,
    opponentModelStrength: 0.88,
    yieldEvery: 24,
  },
  Master: {
    iterations: 1500,
    thinkTimeMs: 1450,
    particleCount: 160,
    rolloutDepth: 10,
    heuristicRolloutChance: 0.82,
    explorationConstant: 0.98,
    intentionalErrorRate: 0,
    evaluationNoise: 0.005,
    opponentModelStrength: 1,
    yieldEvery: 32,
  },
};

export const normalizeDifficulty = (value: string): AIDifficulty => {
  if (value === "Fácil" || value === "Easy") return "Easy";
  if (value === "Difícil" || value === "Hard") return "Hard";
  if (value === "Expert") return "Expert";
  if (value === "Master") return "Master";
  return "Normal";
};

export const legacyDifficultyLabel = (difficulty: AIDifficulty) =>
  difficulty === "Easy" ? "Fácil" : difficulty === "Hard" || difficulty === "Expert" || difficulty === "Master" ? "Difícil" : "Normal";

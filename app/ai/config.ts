import type { AIDifficulty, DifficultyConfig, DifficultyInput } from "./types";

export const DIFFICULTY_CONFIG: Readonly<Record<AIDifficulty, DifficultyConfig>> = Object.freeze({
  Easy: {
    id: "Easy", iterations: 0, maxThinkMs: 18, minThinkMs: 140, particleCount: 6, rolloutDepth: 2,
    heuristicRolloutProbability: 0.9, explorationConstant: 1.55, intentionalMistakeRate: 0.28,
    evaluationNoise: 0.2, heuristicStrength: 0.58, rootActionLimit: 8, yieldEveryIterations: 8,
    cardBudget: 1, responseBias: 0.25, attackBias: 0.68, adaptivePersonality: false,
  },
  Normal: {
    id: "Normal", iterations: 72, maxThinkMs: 42, minThinkMs: 220, particleCount: 16, rolloutDepth: 5,
    heuristicRolloutProbability: 0.7, explorationConstant: 1.45, intentionalMistakeRate: 0.1,
    evaluationNoise: 0.09, heuristicStrength: 0.78, rootActionLimit: 12, yieldEveryIterations: 12,
    cardBudget: 2, responseBias: 0.55, attackBias: 0.88, adaptivePersonality: false,
  },
  Hard: {
    id: "Hard", iterations: 220, maxThinkMs: 82, minThinkMs: 300, particleCount: 32, rolloutDepth: 7,
    heuristicRolloutProbability: 0.7, explorationConstant: 1.36, intentionalMistakeRate: 0.035,
    evaluationNoise: 0.035, heuristicStrength: 0.91, rootActionLimit: 16, yieldEveryIterations: 12,
    cardBudget: 3, responseBias: 0.86, attackBias: 0.97, adaptivePersonality: false,
  },
  Expert: {
    id: "Expert", iterations: 480, maxThinkMs: 145, minThinkMs: 420, particleCount: 48, rolloutDepth: 9,
    heuristicRolloutProbability: 0.72, explorationConstant: 1.3, intentionalMistakeRate: 0.012,
    evaluationNoise: 0.015, heuristicStrength: 0.97, rootActionLimit: 20, yieldEveryIterations: 10,
    cardBudget: 4, responseBias: 0.96, attackBias: 1, adaptivePersonality: false,
  },
  Master: {
    id: "Master", iterations: 900, maxThinkMs: 245, minThinkMs: 560, particleCount: 72, rolloutDepth: 11,
    heuristicRolloutProbability: 0.74, explorationConstant: 1.25, intentionalMistakeRate: 0.003,
    evaluationNoise: 0.005, heuristicStrength: 1, rootActionLimit: 24, yieldEveryIterations: 8,
    cardBudget: 5, responseBias: 1, attackBias: 1, adaptivePersonality: true,
  },
});

export const normalizeDifficulty = (value: DifficultyInput | string = "Normal"): AIDifficulty => {
  const key = String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (key === "easy" || key === "facil") return "Easy";
  if (key === "hard" || key === "dificil") return "Hard";
  if (key === "expert") return "Expert";
  if (key === "master") return "Master";
  return "Normal";
};

export const difficultyConfig = (value: DifficultyInput | string): DifficultyConfig => DIFFICULTY_CONFIG[normalizeDifficulty(value)];

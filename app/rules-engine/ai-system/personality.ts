import type { EvaluationWeights, PersonalityProfile, Playstyle } from "./types";

const BASE: EvaluationWeights = {
  life: 1.5,
  lethal: 18,
  boardAttack: 1.35,
  boardHealth: 0.85,
  keywords: 1.1,
  handValue: 0.9,
  energyEfficiency: 1.05,
  reserveValue: 0.75,
  tempo: 1,
  removal: 1,
  responseValue: 0.9,
  synergy: 1,
  overextensionPenalty: 0.8,
  tradeQuality: 1,
  setupProtection: 0.8,
};

const weights = (overrides: Partial<EvaluationWeights>): EvaluationWeights => ({ ...BASE, ...overrides });

export const PERSONALITIES: Record<Playstyle, PersonalityProfile> = {
  Aggro: {
    id: "Aggro",
    aggression: 0.95,
    riskTolerance: 0.86,
    holdResponses: 0.2,
    tradePreference: 0.35,
    bluffFrequency: 0.18,
    weights: weights({ life: 0.9, lethal: 28, boardAttack: 1.9, boardHealth: 0.5, handValue: 0.45, tempo: 1.45, energyEfficiency: 1.25, overextensionPenalty: 0.25, responseValue: 0.45 }),
  },
  Midrange: {
    id: "Midrange",
    aggression: 0.68,
    riskTolerance: 0.55,
    holdResponses: 0.48,
    tradePreference: 0.65,
    bluffFrequency: 0.1,
    weights: weights({ boardAttack: 1.55, boardHealth: 1.05, tradeQuality: 1.2, synergy: 1.15, lethal: 21 }),
  },
  Control: {
    id: "Control",
    aggression: 0.34,
    riskTolerance: 0.25,
    holdResponses: 0.9,
    tradePreference: 0.92,
    bluffFrequency: 0.08,
    weights: weights({ life: 2, lethal: 16, boardAttack: 0.8, boardHealth: 1.15, handValue: 1.55, removal: 1.7, responseValue: 1.6, overextensionPenalty: 1.5, tradeQuality: 1.45 }),
  },
  Tempo: {
    id: "Tempo",
    aggression: 0.76,
    riskTolerance: 0.6,
    holdResponses: 0.58,
    tradePreference: 0.5,
    bluffFrequency: 0.16,
    weights: weights({ tempo: 1.8, energyEfficiency: 1.75, reserveValue: 1.1, boardAttack: 1.45, responseValue: 1.05, handValue: 0.72, overextensionPenalty: 0.6 }),
  },
  ComboValue: {
    id: "ComboValue",
    aggression: 0.42,
    riskTolerance: 0.44,
    holdResponses: 0.72,
    tradePreference: 0.58,
    bluffFrequency: 0.12,
    weights: weights({ handValue: 1.45, synergy: 1.85, setupProtection: 1.75, responseValue: 1.25, overextensionPenalty: 1.05, tempo: 0.72, lethal: 24 }),
  },
};

const HERO_STYLE: Record<string, Playstyle> = {
  goblin: "Aggro",
  tessalia: "Midrange",
  gimble: "Midrange",
  uruk: "ComboValue",
  tifon: "Control",
  saymon: "Tempo",
  quarion: "ComboValue",
  rasmus: "ComboValue",
  ngoro: "Control",
  zayan: "Midrange",
  natureza: "Midrange",
};

export const personalityForHero = (heroId: string): PersonalityProfile => PERSONALITIES[HERO_STYLE[heroId] || "Midrange"];

/** Master can softly adapt to the current game without becoming omniscient. */
export function adaptivePersonality(base: PersonalityProfile, ownLife: number, enemyLife: number, ownCards: number, enemyCards: number): PersonalityProfile {
  const behindOnLife = ownLife + 7 < enemyLife;
  const aheadOnCards = ownCards > enemyCards + 2;
  if (behindOnLife && !aheadOnCards) return PERSONALITIES.Control;
  if (enemyLife <= 10) return PERSONALITIES.Aggro;
  if (aheadOnCards && base.id !== "Aggro") return PERSONALITIES.ComboValue;
  return base;
}

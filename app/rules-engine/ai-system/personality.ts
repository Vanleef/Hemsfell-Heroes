import type { EvaluationWeights, OpponentMemory, PersonalityProfile, Playstyle } from "./types";

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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const blendNumber = (a: number, b: number, amount: number) => a + (b - a) * clamp01(amount);

/**
 * Blend two profiles instead of hard switching. The returned id remains the
 * base identity so telemetry can still group results by the deck's intended
 * personality while the numeric behavior drifts with the match.
 */
export function blendPersonality(base: PersonalityProfile, target: PersonalityProfile, amount: number): PersonalityProfile {
  const t = clamp01(amount);
  const blendedWeights = Object.fromEntries(Object.keys(base.weights).map((key) => {
    const typed = key as keyof EvaluationWeights;
    return [typed, blendNumber(base.weights[typed], target.weights[typed], t)];
  })) as unknown as EvaluationWeights;
  return {
    id: base.id,
    aggression: blendNumber(base.aggression, target.aggression, t),
    riskTolerance: blendNumber(base.riskTolerance, target.riskTolerance, t),
    holdResponses: blendNumber(base.holdResponses, target.holdResponses, t),
    tradePreference: blendNumber(base.tradePreference, target.tradePreference, t),
    bluffFrequency: blendNumber(base.bluffFrequency, target.bluffFrequency, t),
    weights: blendedWeights,
  };
}

/**
 * Smooth public-state adaptation. `strength` is difficulty-controlled: lower
 * levels retain more of their base identity while Expert/Master react more.
 * Short-term opponent memory nudges the blend without revealing hidden info.
 */
export function adaptivePersonality(
  base: PersonalityProfile,
  ownLife: number,
  enemyLife: number,
  ownCards: number,
  enemyCards: number,
  memory?: OpponentMemory,
  strength = 1,
): PersonalityProfile {
  let current = base;
  const lifeDelta = enemyLife - ownLife;
  const cardDelta = ownCards - enemyCards;
  const lowOwnLife = clamp01((12 - ownLife) / 12);
  const enemyInRange = clamp01((13 - enemyLife) / 13);

  if (lifeDelta >= 5 || lowOwnLife > 0.35) {
    const amount = clamp01((0.16 + lowOwnLife * 0.44 + Math.max(0, lifeDelta - 4) * 0.025) * strength);
    current = blendPersonality(current, PERSONALITIES.Control, amount);
  }
  if (enemyInRange > 0.2) {
    const amount = clamp01((0.1 + enemyInRange * 0.48) * strength);
    current = blendPersonality(current, PERSONALITIES.Aggro, amount);
  }
  if (cardDelta >= 2 && base.id !== "Aggro") {
    const amount = clamp01((0.1 + Math.min(0.3, cardDelta * 0.055)) * strength);
    current = blendPersonality(current, PERSONALITIES.ComboValue, amount);
  }

  if (memory && memory.samples > 0) {
    const confidence = clamp01(memory.samples / 3) * strength;
    if (memory.aggression > 0.62) current = blendPersonality(current, PERSONALITIES.Control, (memory.aggression - 0.5) * 0.38 * confidence);
    if (memory.patience > 0.65) current = blendPersonality(current, PERSONALITIES.Tempo, (memory.patience - 0.5) * 0.28 * confidence);
    if (memory.interaction > 0.62) current = blendPersonality(current, PERSONALITIES.ComboValue, (memory.interaction - 0.5) * 0.24 * confidence);
  }

  return current;
}

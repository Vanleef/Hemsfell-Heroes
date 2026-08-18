export type AIDifficulty = "Easy" | "Normal" | "Hard" | "Expert" | "Master";
export type Playstyle = "Aggro" | "Midrange" | "Control" | "Tempo" | "ComboValue";

export type AIAction = Record<string, unknown> & { type: string; owner?: number };

export interface AIPlayerLike {
  heroId: string;
  level?: number;
  life: number;
  maxLife?: number;
  energy: number;
  reserve: number;
  maxEnergy?: number;
  hand: any[];
  deck: any[];
  board: any[];
  support?: any[];
  terrain?: any | null;
  grave?: any[];
  extraDeck?: any[];
  abilityUses?: Record<string, number>;
  [key: string]: unknown;
}

export interface AIGameState {
  players: AIPlayerLike[];
  active: number;
  phase: string;
  round: number;
  winner?: number | null;
  pendingDecision?: unknown;
  pendingResponse?: { responder?: number } | null;
  [key: string]: unknown;
}

export interface DifficultyConfig {
  iterations: number;
  thinkTimeMs: number;
  particleCount: number;
  rolloutDepth: number;
  heuristicRolloutChance: number;
  explorationConstant: number;
  intentionalErrorRate: number;
  evaluationNoise: number;
  opponentModelStrength: number;
  yieldEvery: number;
}

export interface EvaluationWeights {
  life: number;
  lethal: number;
  boardAttack: number;
  boardHealth: number;
  keywords: number;
  handValue: number;
  energyEfficiency: number;
  reserveValue: number;
  tempo: number;
  removal: number;
  responseValue: number;
  synergy: number;
  overextensionPenalty: number;
  tradeQuality: number;
  setupProtection: number;
}

export interface PersonalityProfile {
  id: Playstyle;
  aggression: number;
  riskTolerance: number;
  holdResponses: number;
  tradePreference: number;
  bluffFrequency: number;
  weights: EvaluationWeights;
}

export interface Particle {
  hiddenHand: any[];
  hiddenDeck: any[];
  weight: number;
}

export interface AIObservation {
  type: "play" | "draw" | "discard" | "reveal" | "shuffle" | "mulligan";
  player: number;
  cardId?: string;
  card?: any;
  count?: number;
}

export interface SearchStats {
  iterations: number;
  elapsedMs: number;
  rootVisits: number;
  selectedVisits: number;
  selectedMeanValue: number;
}

export interface AIChoiceResult {
  action: AIAction | null;
  stats: SearchStats;
  personality: Playstyle;
  difficulty: AIDifficulty;
}

export interface EngineAdapter {
  generateLegalActions(state: AIGameState, owner: number, difficulty: string): AIAction[];
  applyAction(state: AIGameState, action: AIAction): AIGameState;
  cloneState(state: AIGameState): AIGameState;
}

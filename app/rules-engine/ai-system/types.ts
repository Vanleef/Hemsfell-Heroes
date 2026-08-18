export type AIDifficulty = "Easy" | "Normal" | "Hard" | "Expert" | "Master";
export type Playstyle = "Aggro" | "Midrange" | "Control" | "Tempo" | "ComboValue";
export type CalibrationCategory = "lethal" | "trade" | "overextension" | "hold-response" | "development" | "low-life" | "resources" | "hand-cap";

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

export interface OpponentMemory {
  aggression: number;
  patience: number;
  interaction: number;
  samples: number;
}

export interface Particle {
  hiddenHand: any[];
  hiddenDeck: any[];
  weight: number;
  synergyLikelihood?: number;
  drawLikelihood?: number;
}

export interface AIObservation {
  type: "play" | "draw" | "discard" | "reveal" | "shuffle" | "mulligan";
  player: number;
  cardId?: string;
  card?: any;
  count?: number;
  round?: number;
}

export interface SearchStats {
  iterations: number;
  elapsedMs: number;
  rootVisits: number;
  selectedVisits: number;
  selectedMeanValue: number;
  iterationsPerSecond?: number;
  beliefEntropy?: number;
}

export interface AIChoiceResult {
  action: AIAction | null;
  stats: SearchStats;
  personality: Playstyle;
  difficulty: AIDifficulty;
  evaluation?: number;
  lethalMargin?: number;
  beliefEntropy?: number;
}

export interface EngineAdapter {
  generateLegalActions(state: AIGameState, owner: number, difficulty: string): AIAction[];
  applyAction(state: AIGameState, action: AIAction): AIGameState;
  cloneState(state: AIGameState): AIGameState;
}

export interface BeliefDiagnostics {
  entropy: number;
  effectiveParticles: number;
  particleCount: number;
  topWeight: number;
  remainingPool: Record<string, number>;
}

export interface DecisionTelemetry {
  timestamp: number;
  matchId: string;
  owner: number;
  round: number;
  phase: string;
  difficulty: AIDifficulty;
  personality: Playstyle;
  actionKey: string;
  evaluation: number;
  lethalMargin: number;
  beliefEntropy: number;
  iterations: number;
  elapsedMs: number;
  iterationsPerSecond: number;
  energyUnused: number;
  reserveUnused: number;
  responseCardsHeld: number;
  overkill: number;
  category?: CalibrationCategory;
  scenarioId?: string;
}

export interface CalibrationScenario {
  id: string;
  category: CalibrationCategory;
  description: string;
  state: AIGameState;
  owner: number;
  acceptableActionKeys: string[];
  candidateActions: AIAction[];
  successorByActionKey: Record<string, AIGameState>;
}

export interface CalibrationResult {
  scenarioId: string;
  category: CalibrationCategory;
  difficulty: AIDifficulty;
  personality: Playstyle;
  chosenActionKey: string;
  acceptable: boolean;
  evaluation: number;
  lethalMargin: number;
  beliefEntropy: number;
  elapsedMs: number;
  iterations: number;
}

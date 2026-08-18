export type PlayerId = 0 | 1;
export type AIDifficulty = "Easy" | "Normal" | "Hard" | "Expert" | "Master";
export type DifficultyInput = AIDifficulty | "Fácil" | "Difícil";
export type PlaystyleId = "aggro" | "midrange" | "control" | "tempo" | "combo-value";

export interface AICard {
  id: string;
  uid?: string;
  page?: number;
  name: string;
  type: string;
  cost: number;
  atk?: number;
  hp?: number;
  text?: string;
  tags?: string[];
  subtypes?: string[];
  revealed?: boolean;
  revealedTo?: number[];
  [key: string]: unknown;
}

export interface AIUnit extends AICard {
  uid: string;
  slot?: number;
  damage?: number;
  bonusAtk?: number;
  bonusHp?: number;
  temporaryAtk?: number;
  temporaryHp?: number;
  temporaryTags?: string[];
  grantedKeywords?: string[];
  exhausted?: boolean;
  summoning?: boolean;
  frozen?: boolean;
  stunned?: boolean;
  suffocated?: boolean;
  immobilized?: boolean;
  attacksThisTurn?: number;
  attackLimit?: number;
  markers?: number | Record<string, number>;
}

export interface AIPlayerState {
  heroId: string;
  level: number;
  life: number;
  maxLife?: number;
  maxEnergy: number;
  energy: number;
  reserve: number;
  deck: AICard[];
  hand: AICard[];
  board: AIUnit[];
  support: AIUnit[];
  terrain: AIUnit | null;
  grave: AICard[];
  obscuro?: AICard[];
  extraDeck?: AICard[];
  heroXP?: number;
  turnCardsPlayed?: number;
  turnSpellsPlayed?: number;
  abilityUses?: Record<string, number>;
  [key: string]: unknown;
}

export interface AIPendingResponse {
  responder: PlayerId;
  actor: PlayerId;
  action?: string;
  passes?: number;
}

export interface AIPendingDecision {
  kind: string;
  owner: PlayerId;
  effect?: Record<string, unknown>;
  context?: Record<string, unknown>;
  targetSteps?: Array<Record<string, unknown>>;
  sourceName?: string;
}

export interface AIGameState {
  players: [AIPlayerState, AIPlayerState];
  active: PlayerId;
  phase: string;
  round: number;
  winner: number | null;
  events?: number;
  pendingResponse?: AIPendingResponse | null;
  pendingDecision?: AIPendingDecision | null;
  pendingReposition?: { activeOwner?: PlayerId; [key: string]: unknown } | null;
  pendingAction?: Record<string, unknown>;
  priorityStack?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface AIAction {
  type: string;
  owner?: PlayerId;
  [key: string]: unknown;
}

export interface AppliedAction<S> {
  state: S;
  legal: boolean;
}

export interface GameAdapter<S, A> {
  clone(state: S): S;
  legalActions(state: S, actor: PlayerId): A[];
  apply(state: S, action: A): AppliedAction<S>;
  actorToMove(state: S): PlayerId | null;
  isTerminal(state: S): boolean;
  winner(state: S): PlayerId | null;
  actionKey(action: A): string;
  stateKey?(state: S): string;
}

export interface DifficultyConfig {
  id: AIDifficulty;
  iterations: number;
  maxThinkMs: number;
  minThinkMs: number;
  particleCount: number;
  rolloutDepth: number;
  heuristicRolloutProbability: number;
  explorationConstant: number;
  intentionalMistakeRate: number;
  evaluationNoise: number;
  heuristicStrength: number;
  rootActionLimit: number;
  yieldEveryIterations: number;
  cardBudget: number;
  responseBias: number;
  attackBias: number;
  adaptivePersonality: boolean;
}

export interface EvaluationWeights {
  life: number;
  lethal: number;
  board: number;
  tempo: number;
  hand: number;
  boardControl: number;
  pressure: number;
  synergy: number;
  overextension: number;
  responseValue: number;
  resourceEfficiency: number;
  initiative: number;
  risk: number;
}

export interface PlaystyleProfile {
  id: PlaystyleId;
  label: string;
  weights: EvaluationWeights;
  attackAggression: number;
  holdResponseBias: number;
  tradePreference: number;
  riskTolerance: number;
  bluffFrequency: number;
}

export interface EvaluationBreakdown {
  total: number;
  features: Record<keyof EvaluationWeights, number>;
}

export type BeliefObservation =
  | { type: "public-snapshot"; state: AIGameState }
  | { type: "played"; player: PlayerId; card: AICard }
  | { type: "discarded"; player: PlayerId; card?: AICard }
  | { type: "drawn"; player: PlayerId; count?: number }
  | { type: "revealed"; player: PlayerId; card: AICard; zone?: "hand" | "deck" }
  | { type: "shuffled"; player: PlayerId }
  | { type: "mulligan"; player: PlayerId; handSize: number };

export interface BeliefParticle {
  hand: AICard[];
  deck: AICard[];
  weight: number;
}

export interface SearchDiagnostics<A> {
  iterations: number;
  elapsedMs: number;
  determinizations: number;
  root: Array<{ action: A; visits: number; meanValue: number }>;
  selectedBy: "heuristic" | "mcts" | "intentional-mistake" | "forced-lethal";
}

export interface AIThinkResult<A> {
  action: A | null;
  diagnostics: SearchDiagnostics<A>;
}

export interface AIThinkOptions {
  signal?: AbortSignal;
  random?: () => number;
  personality?: PlaystyleId;
  onProgress?: (message: string, progress: number) => void;
}

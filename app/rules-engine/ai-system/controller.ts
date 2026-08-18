import { buildAIActionCandidates, chooseAIHeroAbility, completeAIPlayCommand } from "../ai.mjs";
import { executeCommand } from "../engine.mjs";
import { legalPriorityResponses } from "../priority.mjs";
import { BeliefModel } from "./belief";
import { CombatPlanner } from "./combat";
import { DIFFICULTY_CONFIG, legacyDifficultyLabel, normalizeDifficulty } from "./config";
import { Evaluator } from "./evaluator";
import { MCTS } from "./mcts";
import { adaptivePersonality, personalityForHero } from "./personality";
import { RiskManager } from "./risk";
import type { AIAction, AIChoiceResult, AIDifficulty, AIGameState, AIObservation, EngineAdapter, OpponentMemory, PersonalityProfile } from "./types";

const cloneState = <T,>(state: T): T => structuredClone(state);

const decisionOwner = (state: AIGameState, fallback: number): number => {
  const decision = state.pendingDecision as any;
  if (decision) {
    if (typeof decision.context?.decisionOwner === "number") return decision.context.decisionOwner;
    if (typeof decision.owner === "number") return decision.owner;
  }
  const response = state.pendingResponse as any;
  if (response && typeof response.responder === "number") return response.responder;
  return typeof state.active === "number" ? state.active : fallback;
};

const heroAbilityAction = (state: AIGameState, owner: number, difficulty: string): AIAction | null => {
  const choice = chooseAIHeroAbility(state, owner, difficulty) as any;
  if (!choice) return null;
  const abilityId = choice.kind === "gimble-ready" ? "gimble-level-2"
    : choice.kind === "saymon-lifesteal" ? "saymon-level-2"
    : choice.kind === "saymon-damage" ? "saymon-level-1"
    : choice.kind === "ngoro-stealth" ? "ngoro-level-3"
    : choice.kind === "ngoro-clue-action" ? "ngoro-level-2"
    : choice.kind === "nature-markers" ? "natureza-level-1"
    : "";
  return abilityId ? { type: "activateHero", owner, abilityId, targetIds: choice.targetId ? [choice.targetId] : [] } : null;
};

const generateEngineActions = (state: AIGameState, owner: number, difficulty: string): AIAction[] => {
  const response = state.pendingResponse as any;
  if (response?.responder === owner) {
    const priority = (legalPriorityResponses(state, owner) as AIAction[]).flatMap((raw) => {
      if (raw.type !== "playCard") return [raw];
      const rawCardId = typeof raw.cardId === "string" ? raw.cardId : "";
      const card = state.players[owner]?.hand?.find((candidate: any) => candidate.id === rawCardId);
      const completed = card ? completeAIPlayCommand(state, owner, card, difficulty, { hasPriority: true }) as AIAction | null : null;
      return completed ? [completed] : [];
    });
    return [...priority, { type: "passPriority", owner }];
  }

  const pending = state.pendingDecision as any;
  if (pending && decisionOwner(state, owner) === owner && ["choice", "repeat-choice"].includes(String(pending.kind)) && Array.isArray(pending.effect?.choices)) {
    return pending.effect.choices.map((_: unknown, choiceIndex: number) => ({ type: "resolveDecision", owner, choiceIndex }));
  }

  const actions = buildAIActionCandidates(state, owner, difficulty) as AIAction[];
  const heroAction = state.active === owner && state.phase === "principal" ? heroAbilityAction(state, owner, difficulty) : null;
  return heroAction ? [heroAction, ...actions] : actions;
};

export const defaultAIAdapter: EngineAdapter = {
  generateLegalActions: generateEngineActions,
  applyAction: (state, action) => executeCommand(structuredClone(state), action, { priority: true }).state as AIGameState,
  cloneState,
};

const cardText = (card: any) => String(`${card?.name || ""} ${card?.text || ""} ${(card?.tags || []).join(" ")}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const curveScore = (card: any) => {
  const cost = Number(card?.cost || 0);
  if (cost <= 1) return 4;
  if (cost === 2) return 5;
  if (cost === 3) return 4.2;
  if (cost === 4) return 2.8;
  if (cost === 5) return 1.4;
  return -Math.max(0, cost - 5) * 1.6;
};

const emitThinking = (thinking: boolean, detail: Record<string, unknown> = {}) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("hemsfell:ai-thinking", { detail: { thinking, ...detail } }));
};

const emitDebug = (detail: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("hemsfell:ai-debug", { detail }));
};

const actionKey = (action: AIAction | null) => action ? JSON.stringify(action) : "";
const actionPriority = (action: AIAction) => action.type === "attack" ? 0 : action.type === "activate" || action.type === "activateHero" ? 1 : action.type === "playCard" ? 2 : action.type === "resolveDecision" ? 3 : action.type === "evolveHero" ? 4 : action.type === "passPriority" ? 5 : 6;
const adaptationStrength = (difficulty: AIDifficulty) => difficulty === "Master" ? 1 : difficulty === "Expert" ? 0.78 : difficulty === "Hard" ? 0.55 : difficulty === "Normal" ? 0.28 : 0;

export class AIController {
  private difficulty: AIDifficulty;
  private belief = new BeliefModel();
  private evaluator = new Evaluator();
  private combat = new CombatPlanner();
  private risk = new RiskManager();
  private mcts = new MCTS();
  private adapter: EngineAdapter;
  private initializedFor = "";
  private opponentMemory: OpponentMemory = { aggression: 0.5, patience: 0.5, interaction: 0.5, samples: 0 };

  constructor(difficulty: string = "Normal", adapter: EngineAdapter = defaultAIAdapter) {
    this.difficulty = normalizeDifficulty(difficulty);
    this.adapter = adapter;
  }

  setDifficulty(value: string): void {
    this.difficulty = normalizeDifficulty(value);
  }

  getDifficulty(): AIDifficulty { return this.difficulty; }

  observe(observation: AIObservation): void {
    this.belief.observe(observation);
    this.rememberOpponent(observation);
  }

  async chooseAction(state: AIGameState, owner: number): Promise<AIChoiceResult> {
    const config = DIFFICULTY_CONFIG[this.difficulty];
    const key = `${state.players[owner]?.heroId}:${owner}:${state.players[1 - owner]?.deck?.length ?? 0}:${state.round}`;
    if (!this.initializedFor || this.initializedFor.split(":").slice(0, 2).join(":") !== key.split(":").slice(0, 2).join(":")) {
      this.belief.initialize(state, owner, config.particleCount);
      this.initializedFor = key;
      this.opponentMemory = { aggression: 0.5, patience: 0.5, interaction: 0.5, samples: 0 };
    }

    const basePersonality = personalityForHero(state.players[owner]?.heroId);
    const personality: PersonalityProfile = adaptivePersonality(
      basePersonality,
      state.players[owner]?.life || 0,
      state.players[1 - owner]?.life || 0,
      state.players[owner]?.hand?.length || 0,
      state.players[1 - owner]?.hand?.length || 0,
      this.opponentMemory,
      adaptationStrength(this.difficulty),
    );

    const legalDifficulty = legacyDifficultyLabel(this.difficulty);
    const legal = this.adapter.generateLegalActions(state, owner, legalDifficulty);
    const entropy = this.belief.entropy();
    if (!legal.length) return { action: null, stats: { iterations: 0, elapsedMs: 0, rootVisits: 0, selectedVisits: 0, selectedMeanValue: 0, beliefEntropy: entropy }, personality: personality.id, difficulty: this.difficulty, beliefEntropy: entropy };

    emitThinking(true, { difficulty: this.difficulty, personality: personality.id, expectedMs: config.thinkTimeMs, beliefEntropy: entropy });
    try {
      const planningState = this.belief.determinize(state, owner);

      if (this.difficulty === "Easy") {
        const ranked = legal.map((action) => {
          try {
            const next = this.adapter.applyAction(planningState, action);
            const score = this.evaluator.evaluate(next, owner, personality, config.evaluationNoise) + this.risk.actionBias(planningState, next, owner, personality, action) * 0.35;
            return { action, score, next };
          } catch { return { action, score: -Infinity, next: null as AIGameState | null }; }
        }).sort((a, b) => b.score - a.score);
        const mistake = Math.random() < config.intentionalErrorRate;
        const index = mistake ? Math.min(ranked.length - 1, 1 + Math.floor(Math.random() * Math.min(2, ranked.length - 1))) : 0;
        const picked = ranked[index] || ranked[0];
        const lethalMargin = picked?.next ? this.evaluator.estimateLethal(picked.next, owner).margin : this.evaluator.estimateLethal(planningState, owner).margin;
        return { action: picked?.action || legal[0], stats: { iterations: 0, elapsedMs: 0, rootVisits: 0, selectedVisits: 0, selectedMeanValue: picked?.score || 0, beliefEntropy: entropy }, personality: personality.id, difficulty: this.difficulty, evaluation: picked?.score || 0, lethalMargin, beliefEntropy: entropy };
      }

      // Keep the forced-lethal solver only as a safety early-out. Strategic
      // lethal pressure and risk now live inside Evaluator/MCTS.
      if (["Hard", "Expert", "Master"].includes(this.difficulty)) {
        const lethalAction = this.findRobustForcedLethal(state, owner, legal, legalDifficulty);
        if (lethalAction) {
          return { action: lethalAction, stats: { iterations: 0, elapsedMs: 0, rootVisits: 1, selectedVisits: 1, selectedMeanValue: 1_000_000, beliefEntropy: entropy }, personality: personality.id, difficulty: this.difficulty, evaluation: 1_000_000, lethalMargin: this.evaluator.estimateLethal(planningState, owner).margin, beliefEntropy: entropy };
        }
      }

      const result = await this.mcts.search({ state, owner, config, personality, belief: this.belief, adapter: this.adapter, evaluator: this.evaluator, riskManager: this.risk, legacyDifficulty: legalDifficulty });
      let action = result.action;

      if (action && config.intentionalErrorRate > 0 && legal.length > 1 && Math.random() < config.intentionalErrorRate) {
        const alternatives = legal.filter((candidate) => actionKey(candidate) !== actionKey(action));
        action = alternatives[Math.floor(Math.random() * alternatives.length)] || action;
      }

      let evaluation = result.stats.selectedMeanValue;
      let lethalMargin = this.evaluator.estimateLethal(planningState, owner).margin;
      if (action) {
        try {
          const next = this.adapter.applyAction(planningState, action);
          evaluation = this.evaluator.evaluate(next, owner, personality, 0);
          lethalMargin = this.evaluator.estimateLethal(next, owner).margin;
        } catch { /* keep search telemetry */ }
      }
      emitDebug({ difficulty: this.difficulty, personality: personality.id, belief: this.belief.diagnostics(), opponentMemory: this.opponentMemory, action, evaluation, lethalMargin, stats: result.stats });
      return { action, stats: result.stats, personality: personality.id, difficulty: this.difficulty, evaluation, lethalMargin, beliefEntropy: entropy };
    } finally {
      emitThinking(false, { difficulty: this.difficulty, personality: personality.id });
    }
  }

  private rememberOpponent(observation: AIObservation): void {
    if (observation.type !== "play" && observation.type !== "discard") return;
    const card = observation.card;
    if (!card) return;
    const source = cardText(card);
    const aggressionSignal = /ataque|cause .*dano|veloz|investida|furtivo|atropelar/.test(source) || Number(card?.cost || 0) <= 2 ? 1 : 0.25;
    const interactionSignal = /acelerado|destrua|retorne|previna|barreira|congel|atord|sufoc/.test(source) ? 1 : 0.2;
    const patienceSignal = /compre|busque|investigue|marcador|ultimo suspiro|reserve/.test(source) || Number(card?.cost || 0) >= 5 ? 0.85 : 0.35;
    const alpha = 0.42;
    this.opponentMemory = {
      aggression: this.opponentMemory.aggression * (1 - alpha) + aggressionSignal * alpha,
      interaction: this.opponentMemory.interaction * (1 - alpha) + interactionSignal * alpha,
      patience: this.opponentMemory.patience * (1 - alpha) + patienceSignal * alpha,
      samples: Math.min(3, this.opponentMemory.samples + 1),
    };
  }

  private findRobustForcedLethal(publicState: AIGameState, owner: number, legal: AIAction[], difficulty: string): AIAction | null {
    const samples = this.difficulty === "Master" ? 3 : this.difficulty === "Expert" ? 2 : 1;
    const maxDepth = this.difficulty === "Master" ? 8 : this.difficulty === "Expert" ? 7 : 5;
    const nodeBudget = this.difficulty === "Master" ? 900 : this.difficulty === "Expert" ? 420 : 180;
    const candidates = [...legal].sort((a, b) => actionPriority(a) - actionPriority(b));

    for (const candidate of candidates) {
      let robust = true;
      for (let sample = 0; sample < samples; sample += 1) {
        const hypothesis = this.belief.determinize(publicState, owner);
        let next: AIGameState;
        try { next = this.adapter.applyAction(hypothesis, candidate); }
        catch { robust = false; break; }
        const budget = { remaining: nodeBudget };
        if (!this.canForceWinThisTurn(next, owner, difficulty, maxDepth - 1, budget)) { robust = false; break; }
      }
      if (robust) return candidate;
    }
    return null;
  }

  private canForceWinThisTurn(state: AIGameState, owner: number, difficulty: string, depth: number, budget: { remaining: number }): boolean {
    budget.remaining -= 1;
    if (state.winner === owner) return true;
    if (state.winner != null || depth <= 0 || budget.remaining <= 0) return false;
    if (state.active !== owner && !state.pendingResponse && !state.pendingDecision) return false;

    const actor = decisionOwner(state, owner);
    const actions = this.adapter.generateLegalActions(state, actor, difficulty).sort((a, b) => actionPriority(a) - actionPriority(b));
    if (!actions.length) return false;

    if (actor === owner) {
      for (const action of actions) {
        let next: AIGameState;
        try { next = this.adapter.applyAction(state, action); } catch { continue; }
        if (this.canForceWinThisTurn(next, owner, difficulty, depth - 1, budget)) return true;
        if (budget.remaining <= 0) return false;
      }
      return false;
    }

    for (const action of actions) {
      let next: AIGameState;
      try { next = this.adapter.applyAction(state, action); } catch { continue; }
      if (!this.canForceWinThisTurn(next, owner, difficulty, depth - 1, budget)) return false;
      if (budget.remaining <= 0) return false;
    }
    return true;
  }

  shouldKeepMulligan(state: AIGameState, owner: number): boolean {
    const player = state.players[owner], hand = player.hand || [];
    if (hand.length <= 1) return true;
    const profile = personalityForHero(player.heroId);
    let score = hand.reduce((sum, card) => sum + curveScore(card), 0);
    const costs = hand.map((card) => Number(card?.cost || 0));
    const early = costs.filter((cost) => cost <= 3).length;
    const expensive = costs.filter((cost) => cost >= 6).length;
    score += early * 1.8 - expensive * 2.2;

    const text = hand.map(cardText).join(" ");
    if (player.heroId === "goblin") score += (text.match(/goblin|fura-fila/g) || []).length * 0.65;
    if (player.heroId === "uruk") score += hand.filter((card: any) => card.type === "Feitiço").length * 0.7;
    if (player.heroId === "gimble") score += (text.match(/dragao/g) || []).length * 0.65;
    if (player.heroId === "saymon") score += (text.match(/vampiro|roubo de vida/g) || []).length * 0.55;
    if (profile.id === "Aggro") score += early * 0.8;
    if (profile.id === "Control") score += hand.filter((card) => /destrua|dano|acelerado|compre/.test(cardText(card))).length * 0.7;

    const threshold = hand.length * (this.difficulty === "Easy" ? 2.3 : this.difficulty === "Normal" ? 2.8 : 3.15);
    if (this.difficulty === "Easy" && Math.random() < 0.2) return Math.random() < 0.5;
    return score >= threshold;
  }

  lethal(state: AIGameState, owner: number) {
    return this.evaluator.estimateLethal(state, owner);
  }

  planAttacks(state: AIGameState, owner: number) {
    return this.combat.planAttacks(state, owner, personalityForHero(state.players[owner]?.heroId));
  }

  chooseBlock(state: AIGameState, owner: number, attacker: any) {
    return this.combat.chooseBlock(state, owner, attacker, personalityForHero(state.players[owner]?.heroId));
  }

  debugEvaluation(state: AIGameState, owner: number) {
    const base = personalityForHero(state.players[owner]?.heroId);
    const profile = adaptivePersonality(base, state.players[owner]?.life || 0, state.players[1 - owner]?.life || 0, state.players[owner]?.hand?.length || 0, state.players[1 - owner]?.hand?.length || 0, this.opponentMemory, adaptationStrength(this.difficulty));
    return this.evaluator.breakdown(state, owner, profile, 0);
  }

  beliefEntropy(): number { return this.belief.entropy(); }
  beliefDiagnostics() { return this.belief.diagnostics(); }
  opponentModel(): OpponentMemory { return { ...this.opponentMemory }; }
}

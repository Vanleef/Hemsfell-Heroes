import { buildAIActionCandidates, completeAIPlayCommand } from "../ai.mjs";
import { executeCommand } from "../engine.mjs";
import { legalPriorityResponses } from "../priority.mjs";
import { BeliefModel } from "./belief";
import { CombatPlanner } from "./combat";
import { DIFFICULTY_CONFIG, legacyDifficultyLabel, normalizeDifficulty } from "./config";
import { Evaluator } from "./evaluator";
import { MCTS } from "./mcts";
import { adaptivePersonality, personalityForHero } from "./personality";
import { RiskManager } from "./risk";
import type { AIAction, AIChoiceResult, AIDifficulty, AIGameState, AIObservation, EngineAdapter, PersonalityProfile } from "./types";

const cloneState = <T,>(state: T): T => structuredClone(state);

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
  return buildAIActionCandidates(state, owner, difficulty) as AIAction[];
};

const defaultAdapter: EngineAdapter = {
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

const actionKey = (action: AIAction | null) => action ? JSON.stringify(action) : "";

export class AIController {
  private difficulty: AIDifficulty;
  private belief = new BeliefModel();
  private evaluator = new Evaluator();
  private combat = new CombatPlanner();
  private risk = new RiskManager();
  private mcts = new MCTS();
  private adapter: EngineAdapter;
  private initializedFor = "";

  constructor(difficulty: string = "Normal", adapter: EngineAdapter = defaultAdapter) {
    this.difficulty = normalizeDifficulty(difficulty);
    this.adapter = adapter;
  }

  setDifficulty(value: string): void {
    this.difficulty = normalizeDifficulty(value);
  }

  getDifficulty(): AIDifficulty { return this.difficulty; }

  observe(observation: AIObservation): void {
    this.belief.observe(observation);
  }

  async chooseAction(state: AIGameState, owner: number): Promise<AIChoiceResult> {
    const config = DIFFICULTY_CONFIG[this.difficulty];
    const key = `${state.players[owner]?.heroId}:${owner}:${state.players[1 - owner]?.deck?.length ?? 0}:${state.round}`;
    if (!this.initializedFor || this.initializedFor.split(":").slice(0, 2).join(":") !== key.split(":").slice(0, 2).join(":")) {
      this.belief.initialize(state, owner, config.particleCount);
      this.initializedFor = key;
    }

    let personality: PersonalityProfile = personalityForHero(state.players[owner]?.heroId);
    if (this.difficulty === "Master") {
      personality = adaptivePersonality(
        personality,
        state.players[owner]?.life || 0,
        state.players[1 - owner]?.life || 0,
        state.players[owner]?.hand?.length || 0,
        state.players[1 - owner]?.hand?.length || 0,
      );
    }

    const legalDifficulty = legacyDifficultyLabel(this.difficulty);
    const legal = this.adapter.generateLegalActions(state, owner, legalDifficulty);
    if (!legal.length) return { action: null, stats: { iterations: 0, elapsedMs: 0, rootVisits: 0, selectedVisits: 0, selectedMeanValue: 0 }, personality: personality.id, difficulty: this.difficulty };

    emitThinking(true, { difficulty: this.difficulty, personality: personality.id, expectedMs: config.thinkTimeMs });
    try {
      // Any one-ply or post-search heuristic must evaluate a sampled hidden
      // state, never the actual opponent hand stored by the local game model.
      const planningState = this.belief.determinize(state, owner);

      // Easy deliberately avoids tree search. It ranks one ply, then occasionally
      // picks a plausible inferior line instead of making obviously random plays.
      if (this.difficulty === "Easy") {
        const ranked = legal.map((action) => {
          try {
            const next = this.adapter.applyAction(planningState, action);
            return { action, score: this.evaluator.evaluate(next, owner, personality, config.evaluationNoise) };
          } catch { return { action, score: -Infinity }; }
        }).sort((a, b) => b.score - a.score);
        const mistake = Math.random() < config.intentionalErrorRate;
        const index = mistake ? Math.min(ranked.length - 1, 1 + Math.floor(Math.random() * Math.min(2, ranked.length - 1))) : 0;
        return { action: ranked[index]?.action || legal[0], stats: { iterations: 0, elapsedMs: 0, rootVisits: 0, selectedVisits: 0, selectedMeanValue: ranked[index]?.score || 0 }, personality: personality.id, difficulty: this.difficulty };
      }

      const result = await this.mcts.search({ state, owner, config, personality, belief: this.belief, adapter: this.adapter, evaluator: this.evaluator, legacyDifficulty: legalDifficulty });
      let action = this.applyRiskPolicy(state, planningState, owner, personality, result.action, legal, config.evaluationNoise);

      // Lower non-easy levels retain a small, controlled error model: choose a
      // legal alternative, never an illegal move or information-cheating line.
      if (action && config.intentionalErrorRate > 0 && legal.length > 1 && Math.random() < config.intentionalErrorRate) {
        const alternatives = legal.filter((candidate) => actionKey(candidate) !== actionKey(action));
        action = alternatives[Math.floor(Math.random() * alternatives.length)] || action;
      }

      return { action, stats: result.stats, personality: personality.id, difficulty: this.difficulty };
    } finally {
      emitThinking(false, { difficulty: this.difficulty, personality: personality.id });
    }
  }

  /**
   * A search can correctly value development but still choose a marginal extra
   * permanent when a human Control/Combo player would respect a possible sweep.
   * Risk uses only public counts; score comparisons use a belief determinization
   * so this safety layer cannot accidentally inspect the true hidden hand.
   */
  private applyRiskPolicy(publicState: AIGameState, planningState: AIGameState, owner: number, personality: PersonalityProfile, selected: AIAction | null, legal: AIAction[], noise: number): AIAction | null {
    if (!selected || selected.type !== "playCard" || this.risk.shouldOverextend(publicState, owner, personality)) return selected;
    if (this.combat.findLethal(publicState, owner)) return selected;

    const alternatives = legal.filter((action) => action.type !== "playCard");
    if (!alternatives.length) return selected;

    let selectedScore = -Infinity;
    try { selectedScore = this.evaluator.evaluate(this.adapter.applyAction(planningState, selected), owner, personality, 0); } catch { return alternatives[0]; }

    const ranked = alternatives.map((action) => {
      try { return { action, score: this.evaluator.evaluate(this.adapter.applyAction(planningState, action), owner, personality, noise * .25) }; }
      catch { return { action, score: -Infinity }; }
    }).sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const patience = personality.holdResponses * 1.5 + personality.weights.setupProtection * .08;
    return best && best.score + patience >= selectedScore ? best.action : selected;
  }

  /** Intelligent whole-hand mulligan for the current Hemsfell mulligan model. */
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
    return this.evaluator.breakdown(state, owner, personalityForHero(state.players[owner]?.heroId), 0);
  }

  beliefEntropy(): number { return this.belief.entropy(); }
}

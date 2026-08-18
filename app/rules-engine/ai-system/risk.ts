import type { AIAction, AIGameState, PersonalityProfile } from "./types";

const text = (card: any) => String(`${card?.text || ""} ${(card?.tags || []).join(" ")}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const currentAttack = (card: any) => Math.max(0, Number(card?.atk || 0) + Number(card?.bonusAtk || 0) + Number(card?.temporaryAtk || 0));
const responseCards = (player: any) => (player.hand || []).filter((card: any) => /acelerado|destrua|dano|retorne|previna|barreira/.test(text(card)));

export interface RiskDecision {
  hold: boolean;
  bluff: boolean;
  confidence: number;
  reason: string;
}

/**
 * Risk/bluff policy never invents hidden information. A "bluff" means
 * preserving open Reserve/energy and passing despite holding a legal response,
 * creating the same timing uncertainty a human opponent would create.
 */
export class RiskManager {
  responseDecision(state: AIGameState, owner: number, profile: PersonalityProfile, random: () => number = Math.random): RiskDecision {
    const me = state.players[owner], foe = state.players[1 - owner];
    const responses = responseCards(me);
    if (!responses.length) return { hold: false, bluff: false, confidence: 1, reason: "no-response" };

    const reserve = Number(me.reserve || 0);
    const lifePressure = Math.max(0, 12 - Number(me.life || 0)) / 12;
    const enemyBoardPressure = (foe.board || []).reduce((sum: number, card: any) => sum + currentAttack(card), 0) / Math.max(1, Number(me.life || 1));
    const danger = Math.min(1, lifePressure + enemyBoardPressure * 0.45);
    const holdChance = profile.holdResponses * (1 - danger * 0.75);
    const bluffChance = profile.bluffFrequency * (reserve > 0 ? 1 : 0.25) * (1 - danger);
    const roll = random();
    const hold = roll < holdChance;
    const bluff = hold && random() < bluffChance;
    return {
      hold,
      bluff,
      confidence: Math.max(0, Math.min(1, 1 - danger * (1 - profile.riskTolerance))),
      reason: bluff ? "preserve-open-resource" : hold ? "hold-for-higher-value" : danger > 0.6 ? "answer-current-threat" : "spend-response",
    };
  }

  shouldOverextend(state: AIGameState, owner: number, profile: PersonalityProfile): boolean {
    const me = state.players[owner], foe = state.players[1 - owner];
    const boardSize = (me.board || []).length;
    const enemyCards = (foe.hand || []).length;
    if (boardSize < 3) return true;
    const lethalPressure = (me.board || []).reduce((sum: number, card: any) => sum + currentAttack(card), 0) >= Number(foe.life || 0);
    if (lethalPressure) return true;
    const sweepRisk = Math.min(1, enemyCards / 7) * (boardSize - 2) / 3;
    return profile.riskTolerance > sweepRisk;
  }

  /**
   * Search-time action bias. This is deliberately smaller than the evaluator's
   * state value: it guides rollouts/UCT tie-breaking without replacing MCTS.
   */
  actionBias(state: AIGameState, next: AIGameState, owner: number, profile: PersonalityProfile, action: AIAction, random: () => number = Math.random): number {
    const me = state.players[owner];
    const foe = state.players[1 - owner];
    const danger = Math.min(1, ((foe.board || []).reduce((sum: number, card: any) => sum + currentAttack(card), 0)) / Math.max(1, Number(me.life || 1)));
    let score = 0;

    if (action.type === "playCard" && !this.shouldOverextend(state, owner, profile)) {
      const before = (me.board || []).length;
      const after = (next.players[owner]?.board || []).length;
      if (after > before) score -= (after - before) * (1.2 + profile.weights.overextensionPenalty * 1.8);
    }

    if (action.type === "passPriority" && responseCards(me).length) {
      const openResources = Number(me.reserve || 0) + Number(me.energy || 0);
      const holdValue = profile.holdResponses * (1 - danger) * Math.min(2.4, 0.45 + openResources * 0.18);
      score += holdValue;
      if (openResources > 0 && random() < profile.bluffFrequency * (1 - danger)) score += 0.45 + profile.bluffFrequency;
    }

    if (action.type === "attack") {
      score += profile.aggression * 0.7;
      if (Number(foe.life || 0) <= 10) score += profile.aggression * 0.85;
    }

    if (action.type === "advancePhase" && state.phase === "principal") {
      const energy = Number(me.energy || 0);
      const reserve = Number(me.reserve || 0);
      const reserveSpace = Math.max(0, 3 - reserve);
      const wasted = Math.max(0, energy - reserveSpace);
      score -= wasted * (0.35 + profile.weights.energyEfficiency * 0.18);
    }

    return score;
  }
}

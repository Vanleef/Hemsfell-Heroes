import type { AIAction, AIGameState, PersonalityProfile } from "./types";

const text = (card: any) => String(`${card?.text || ""} ${(card?.tags || []).join(" ")}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const currentAttack = (card: any) => Math.max(0, Number(card?.atk || 0) + Number(card?.bonusAtk || 0) + Number(card?.temporaryAtk || 0));
const responseCards = (player: any) => (player.hand || []).filter((card: any) => /acelerado|destrua|dano|retorne|previna|barreira/.test(text(card)));
const representedSweep = (player: any) => (player.hand || []).some((card: any) => /todas? .*criaturas|cada criatura|todas? .*unidades/.test(text(card)));

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
    // A revealed/represented sweeper is qualitatively different from generic
    // hidden-hand risk. Even aggressive profiles should demand a real closing
    // payoff before committing another body into it.
    if (representedSweep(foe)) return false;
    const sweepRisk = Math.min(1, enemyCards / 7) * (boardSize - 2) / 3;
    return profile.riskTolerance > sweepRisk;
  }

  /**
   * Search-time action bias. This is deliberately smaller than terminal lethal
   * values, but large enough to make timing/resource choices visible to MCTS.
   */
  actionBias(state: AIGameState, next: AIGameState, owner: number, profile: PersonalityProfile, action: AIAction, random: () => number = Math.random): number {
    const me = state.players[owner];
    const foe = state.players[1 - owner];
    const ownLife = Number(me.life || 0);
    const danger = Math.min(1, ((foe.board || []).reduce((sum: number, card: any) => sum + currentAttack(card), 0)) / Math.max(1, ownLife));
    let score = 0;

    if (action.type === "playCard" && !this.shouldOverextend(state, owner, profile)) {
      const before = (me.board || []).length;
      const after = (next.players[owner]?.board || []).length;
      if (after > before) {
        const knownSweepMultiplier = representedSweep(foe) ? 4.25 : 1;
        score -= (after - before) * (1.4 + profile.weights.overextensionPenalty * 2.1) * knownSweepMultiplier;
      }
    }

    // At genuinely low life, a human opponent stops treating healing/prevention
    // and pure greed as equivalent value plays. This bias lives inside search,
    // so Normal+ can naturally stabilize without a post-MCTS emergency rule.
    if (action.type === "playCard" && ownLife <= 8) {
      const cardId = typeof action.cardId === "string" ? action.cardId : "";
      const played = (me.hand || []).find((card: any) => String(card?.id ?? card?.uid ?? "") === cardId);
      const source = text(played);
      const stabilizes = /cure|previna|barreira|roubo de vida/.test(source);
      const pureGreed = /compre|busque|procure|investigue/.test(source) && !stabilizes;
      const urgency = Math.max(0, 9 - ownLife);
      if (stabilizes) score += urgency * 0.9 + danger * 2.6 + profile.weights.life * 0.35;
      if (pureGreed) score -= urgency * 0.5 + danger * 1.35;
    }

    if (state.pendingResponse && responseCards(me).length) {
      const openResources = Number(me.reserve || 0) + Number(me.energy || 0);
      const responseCount = responseCards(me).length;
      const patienceValue = (1 - danger) * (
        1.6 + profile.holdResponses * 4.2 + Math.min(2.6, openResources * 0.28) + Math.min(1.1, responseCount * 0.35)
      );
      if (action.type === "passPriority") {
        score += patienceValue;
        if (openResources > 0 && random() < profile.bluffFrequency * (1 - danger)) score += 0.55 + profile.bluffFrequency * 1.4;
      } else if (action.type === "playCard") {
        // Spending interaction on a low-danger window has an opportunity cost.
        // This fades rapidly as the board becomes threatening.
        score -= patienceValue * Math.max(0, 0.72 - danger) * 0.58;
      }
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

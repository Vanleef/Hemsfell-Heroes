import type { AIGameState, PersonalityProfile } from "./types";

const text = (card: any) => String(`${card?.text || ""} ${(card?.tags || []).join(" ")}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export interface RiskDecision {
  hold: boolean;
  bluff: boolean;
  confidence: number;
  reason: string;
}

/**
 * Risk/bluff policy never invents hidden information. A "bluff" here means
 * preserving open Reserve/energy and passing despite holding a legal response,
 * creating the same uncertainty a human opponent would create.
 */
export class RiskManager {
  responseDecision(state: AIGameState, owner: number, profile: PersonalityProfile, random: () => number = Math.random): RiskDecision {
    const me = state.players[owner], foe = state.players[1 - owner];
    const responses = (me.hand || []).filter((card: any) => /acelerado|destrua|dano|retorne|previna|barreira/.test(text(card)));
    if (!responses.length) return { hold: false, bluff: false, confidence: 1, reason: "no-response" };

    const reserve = Number(me.reserve || 0);
    const lifePressure = Math.max(0, 12 - Number(me.life || 0)) / 12;
    const enemyBoardPressure = (foe.board || []).reduce((sum: number, card: any) => sum + Number(card?.atk || 0) + Number(card?.bonusAtk || 0), 0) / Math.max(1, Number(me.life || 1));
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
    const lethalPressure = (me.board || []).reduce((sum: number, card: any) => sum + Number(card?.atk || 0) + Number(card?.bonusAtk || 0), 0) >= Number(foe.life || 0);
    if (lethalPressure) return true;
    const sweepRisk = Math.min(1, enemyCards / 7) * (boardSize - 2) / 3;
    return profile.riskTolerance > sweepRisk;
  }
}

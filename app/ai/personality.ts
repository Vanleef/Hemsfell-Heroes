import type { AIGameState, EvaluationWeights, PlayerId, PlaystyleId, PlaystyleProfile } from "./types";

const weights = (partial: Partial<EvaluationWeights>): EvaluationWeights => ({
  life: 1, lethal: 1, board: 1, tempo: 1, hand: 1, boardControl: 1, pressure: 1,
  synergy: 1, overextension: 1, responseValue: 1, resourceEfficiency: 1, initiative: 1, risk: 1,
  ...partial,
});

export const PLAYSTYLES: Readonly<Record<PlaystyleId, PlaystyleProfile>> = Object.freeze({
  aggro: {
    id: "aggro", label: "Aggro", weights: weights({ life: .7, lethal: 2.1, board: 1.05, tempo: 1.35, hand: .45, boardControl: .65, pressure: 1.9, synergy: .75, overextension: .45, responseValue: .55, resourceEfficiency: 1.15, initiative: 1.45, risk: .55 }),
    attackAggression: .96, holdResponseBias: .25, tradePreference: .35, riskTolerance: .88, bluffFrequency: .2,
  },
  midrange: {
    id: "midrange", label: "Midrange", weights: weights({ life: 1, lethal: 1.45, board: 1.45, tempo: 1.15, hand: .9, boardControl: 1.15, pressure: 1.15, synergy: 1, overextension: 1, responseValue: .9, resourceEfficiency: 1.1, initiative: 1.05, risk: 1 }),
    attackAggression: .74, holdResponseBias: .55, tradePreference: .68, riskTolerance: .58, bluffFrequency: .12,
  },
  control: {
    id: "control", label: "Control", weights: weights({ life: 1.3, lethal: 1.35, board: 1.1, tempo: .85, hand: 1.45, boardControl: 1.8, pressure: .55, synergy: 1.05, overextension: 1.55, responseValue: 1.65, resourceEfficiency: 1.15, initiative: .75, risk: 1.4 }),
    attackAggression: .42, holdResponseBias: .92, tradePreference: .92, riskTolerance: .28, bluffFrequency: .32,
  },
  tempo: {
    id: "tempo", label: "Tempo", weights: weights({ life: .9, lethal: 1.6, board: 1.15, tempo: 1.85, hand: .75, boardControl: 1.2, pressure: 1.4, synergy: .9, overextension: .75, responseValue: 1.2, resourceEfficiency: 1.75, initiative: 1.8, risk: .85 }),
    attackAggression: .82, holdResponseBias: .7, tradePreference: .58, riskTolerance: .66, bluffFrequency: .28,
  },
  "combo-value": {
    id: "combo-value", label: "Combo / Value", weights: weights({ life: 1.05, lethal: 1.65, board: .85, tempo: .8, hand: 1.6, boardControl: .95, pressure: .65, synergy: 2, overextension: 1.35, responseValue: 1.4, resourceEfficiency: 1.15, initiative: .8, risk: 1.2 }),
    attackAggression: .52, holdResponseBias: .84, tradePreference: .62, riskTolerance: .42, bluffFrequency: .22,
  },
});

const HERO_DEFAULTS: Readonly<Record<string, PlaystyleId>> = Object.freeze({
  gimble: "midrange", goblin: "aggro", uruk: "combo-value", tifon: "control", saymon: "midrange",
  tessalia: "midrange", quarion: "combo-value", rasmus: "combo-value", ngoro: "control", zayan: "tempo", natureza: "combo-value",
});

export const defaultPlaystyleForHero = (heroId: string): PlaystyleId => HERO_DEFAULTS[heroId] ?? "midrange";

export function selectAdaptivePlaystyle(state: AIGameState, owner: PlayerId, preferred?: PlaystyleId): PlaystyleProfile {
  const self = state.players[owner], foe = state.players[owner === 0 ? 1 : 0];
  const fallback = preferred ?? defaultPlaystyleForHero(self.heroId);
  const readyPower = self.board.reduce((sum, unit) => sum + (!unit.exhausted && !unit.stunned ? Number(unit.atk ?? 0) + Number(unit.bonusAtk ?? 0) : 0), 0);
  const foeLife = Number(foe.life ?? 30);
  const lifeDanger = self.life <= 10 && foe.life > self.life;
  const handEdge = self.hand.length - foe.hand.length;
  const boardBehind = self.board.length + self.support.length < foe.board.length + foe.support.length;

  if (readyPower >= foeLife || foeLife <= 7) return PLAYSTYLES.aggro;
  if (lifeDanger || (boardBehind && handEdge >= 1)) return PLAYSTYLES.control;
  if (self.reserve >= 2 && self.hand.some(card => /acelerado|instant/i.test(`${card.text ?? ""} ${(card.tags ?? []).join(" ")}`))) return PLAYSTYLES.tempo;
  if (self.hand.length >= 6 && /uruk|quarion|rasmus|natureza/.test(self.heroId)) return PLAYSTYLES["combo-value"];
  return PLAYSTYLES[fallback];
}

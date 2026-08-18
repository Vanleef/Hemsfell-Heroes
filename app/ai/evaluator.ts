import type { AICard, AIGameState, AIPlayerState, AIUnit, EvaluationBreakdown, EvaluationWeights, PlayerId, PlaystyleProfile } from "./types";

const fold = (value: unknown): string => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const units = (player: AIPlayerState): AIUnit[] => [...player.board, ...player.support, ...(player.terrain ? [player.terrain] : [])];
const effectiveAttack = (unit: AIUnit): number => unit.frozen ? 0 : Math.max(0, Number(unit.atk ?? 0) + Number(unit.bonusAtk ?? 0) + Number(unit.temporaryAtk ?? 0));
const effectiveHealth = (unit: AIUnit): number => Math.max(0, Number(unit.hp ?? 0) + Number(unit.bonusHp ?? 0) + Number(unit.temporaryHp ?? 0) - Number(unit.damage ?? 0));
const keywordText = (card: AICard): string => fold(`${card.text ?? ""} ${(card.tags ?? []).join(" ")} ${(card.subtypes ?? []).join(" ")}`);

const KEYWORD_VALUE: ReadonlyArray<[RegExp, number]> = [
  [/roubo de vida/, 1.5], [/toque da morte/, 1.75], [/indestrutivel/, 2.1], [/barreira magica/, 1.55],
  [/veloz/, 1.1], [/furtivo/, 1.4], [/atropelar/, 1.15], [/voar/, .9], [/robusto/, 1.05], [/alerta/, .9],
  [/primeiro ato/, .65], [/ultimo suspiro/, .75], [/investida/, .7], [/defensor/, .55],
];

export function intrinsicCardValue(card: AICard): number {
  const text = keywordText(card);
  let value = Number(card.cost ?? 0) * .42 + Number(card.atk ?? 0) * 1.05 + Number(card.hp ?? 0) * .62;
  if (card.type === "Criatura") value += 1.8;
  if (/compre|busque|procure|investigue/.test(text)) value += 1.8;
  if (/destrua|bana|cause\s+\d+\s+de dano|retorne.*mao|sufocad|atordoad|congelad/.test(text)) value += 2.2;
  if (/cure|restaure|recupere/.test(text)) value += .9;
  for (const [pattern, bonus] of KEYWORD_VALUE) if (pattern.test(text)) value += bonus;
  return value;
}

function boardScore(player: AIPlayerState): number {
  return units(player).reduce((sum, unit) => {
    if (unit.suffocated) return sum + effectiveAttack(unit) * .55 + effectiveHealth(unit) * .38;
    const text = keywordText(unit);
    let score = effectiveAttack(unit) * 1.22 + effectiveHealth(unit) * .72 + intrinsicCardValue(unit) * .35;
    if (unit.exhausted) score *= .9;
    if (unit.stunned || unit.immobilized) score *= .72;
    for (const [pattern, bonus] of KEYWORD_VALUE) if (pattern.test(text)) score += bonus;
    return sum + score;
  }, 0);
}

function attackPressure(player: AIPlayerState): number {
  return player.board.reduce((sum, unit) => {
    const used = Number(unit.attacksThisTurn ?? 0), limit = Number(unit.attackLimit ?? 1);
    const ready = !unit.exhausted && !unit.summoning && !unit.stunned && !unit.immobilized && used < limit;
    if (!ready) return sum;
    const text = keywordText(unit);
    return sum + effectiveAttack(unit) * (/furtivo/.test(text) ? 1.35 : /voar/.test(text) ? 1.12 : 1);
  }, 0);
}

function responsePotential(player: AIPlayerState): number {
  const fast = player.hand.filter(card => /acelerado|instantaneo|instantâneo/.test(keywordText(card)));
  const affordable = fast.filter(card => Number(card.cost ?? 0) <= Number(player.reserve ?? 0));
  return affordable.reduce((sum, card) => sum + 1 + intrinsicCardValue(card) * .28, 0) + Number(player.reserve ?? 0) * .35;
}

function synergyScore(player: AIPlayerState): number {
  const all = [...player.hand, ...units(player)];
  const words = all.map(keywordText);
  const count = (pattern: RegExp): number => words.filter(value => pattern.test(value)).length;
  let score = 0;
  switch (player.heroId) {
    case "gimble": score += count(/dragao/) * .75; break;
    case "goblin": score += count(/goblin|fura-fila/) * .68 + Number(player.turnCardsPlayed ?? 0) * .28; break;
    case "uruk": score += player.hand.filter(card => card.type === "Feitiço").length * .62; break;
    case "tifon": score += count(/ultimo suspiro/) * .72 + player.grave.filter(card => card.type === "Criatura").length * .1; break;
    case "saymon": score += count(/vampiro|roubo de vida/) * .65; break;
    case "tessalia": score += player.board.some(unit => unit.slot === 2) ? 2.2 : -1.6; break;
    case "quarion": score += count(/primeiro ato/) * .72; break;
    case "rasmus": score += count(/gato|cafe/) * .65; break;
    case "ngoro": score += Number(player.heroXP ?? 0) * .3 + count(/investig|tritur/) * .45; break;
    case "zayan": score += all.filter(card => !(card.text ?? "").trim()).length * .7; break;
    case "natureza": score += units(player).reduce((sum, card) => sum + markerCount(card), 0) * .18; break;
    default: break;
  }
  return score;
}

function markerCount(card: AIUnit): number {
  if (typeof card.markers === "number") return card.markers;
  return Object.values(card.markers ?? {}).reduce((sum, value) => sum + Number(value ?? 0), 0);
}

function directDamageInHand(player: AIPlayerState): number {
  return player.hand.reduce((sum, card) => {
    if (Number(card.cost ?? 0) > Number(player.energy ?? 0) + Number(player.reserve ?? 0)) return sum;
    const text = fold(card.text);
    const damage = text.match(/cause\s+(\d+)\s+de dano/);
    return sum + (damage ? Number(damage[1]) : 0);
  }, 0);
}

function overextension(player: AIPlayerState, opponent: AIPlayerState): number {
  const board = player.board.length + player.support.length;
  const hand = player.hand.length;
  const opponentSweep = opponent.hand.some(card => /todas.*criaturas|cada criatura|terremoto|destrua todas|dano a cada/.test(fold(card.text)));
  return Math.max(0, board - 3) * (hand <= 3 ? .85 : .42) * (opponentSweep ? 1.45 : 1);
}

function resourceEfficiency(player: AIPlayerState): number {
  const total = Math.max(1, Number(player.maxEnergy ?? 0) + 3);
  const unused = Number(player.energy ?? 0) + Number(player.reserve ?? 0);
  const playable = player.hand.filter(card => Number(card.cost ?? 0) <= unused).length;
  return playable * .32 - Math.max(0, Number(player.energy ?? 0) - 2) / total;
}

export class Evaluator {
  evaluate(state: AIGameState, owner: PlayerId, profile: PlaystyleProfile): EvaluationBreakdown {
    const self = state.players[owner], foe = state.players[owner === 0 ? 1 : 0];
    if (state.winner === owner || foe.life <= 0) return this.terminal(1);
    if (state.winner === (owner === 0 ? 1 : 0) || self.life <= 0) return this.terminal(-1);

    const selfPressure = attackPressure(self), foePressure = attackPressure(foe);
    const selfBurst = directDamageInHand(self), foeBurst = directDamageInHand(foe);
    const lethalMargin = selfPressure + selfBurst - foe.life;
    const dangerMargin = foePressure + foeBurst - self.life;
    const resourcesSelf = Number(self.energy ?? 0) + Number(self.reserve ?? 0);
    const resourcesFoe = Number(foe.energy ?? 0) + Number(foe.reserve ?? 0);
    const boardSelf = boardScore(self), boardFoe = boardScore(foe);
    const handSelf = self.hand.reduce((sum, card) => sum + intrinsicCardValue(card), 0);
    const handFoe = foe.hand.reduce((sum, card) => sum + intrinsicCardValue(card), 0);

    const features: Record<keyof EvaluationWeights, number> = {
      life: clamp((self.life - foe.life) / 30, -1.5, 1.5),
      lethal: lethalMargin >= 0 ? 1 : dangerMargin >= 0 ? -1 : clamp((selfPressure + selfBurst - foePressure - foeBurst) / 18, -1, 1),
      board: clamp((boardSelf - boardFoe) / 24, -1.5, 1.5),
      tempo: clamp((selfPressure - foePressure + resourcesSelf - resourcesFoe) / 14, -1.25, 1.25),
      hand: clamp((handSelf - handFoe) / 28, -1.2, 1.2),
      boardControl: clamp((boardSelf - boardFoe + (5 - foe.board.length) - (5 - self.board.length)) / 25, -1.25, 1.25),
      pressure: clamp((selfPressure + selfBurst - foePressure * .55) / 18, -1.2, 1.4),
      synergy: clamp((synergyScore(self) - synergyScore(foe)) / 10, -1.2, 1.2),
      overextension: clamp(overextension(foe, self) - overextension(self, foe), -1, 1),
      responseValue: clamp((responsePotential(self) - responsePotential(foe)) / 8, -1.2, 1.2),
      resourceEfficiency: clamp(resourceEfficiency(self) - resourceEfficiency(foe), -1, 1),
      initiative: state.active === owner ? .35 : -.18,
      risk: clamp((self.life - Math.max(0, foePressure + foeBurst)) / 30 - (foe.life - Math.max(0, selfPressure + selfBurst)) / 30, -1, 1),
    };

    const total = (Object.keys(features) as Array<keyof EvaluationWeights>).reduce((sum, key) => sum + features[key] * profile.weights[key], 0);
    return { total: Math.tanh(total / 6), features };
  }

  scoreActionDelta(before: AIGameState, after: AIGameState, owner: PlayerId, profile: PlaystyleProfile): number {
    return this.evaluate(after, owner, profile).total - this.evaluate(before, owner, profile).total;
  }

  private terminal(value: 1 | -1): EvaluationBreakdown {
    const features = Object.fromEntries(["life", "lethal", "board", "tempo", "hand", "boardControl", "pressure", "synergy", "overextension", "responseValue", "resourceEfficiency", "initiative", "risk"].map(key => [key, value])) as Record<keyof EvaluationWeights, number>;
    return { total: value, features };
  }
}

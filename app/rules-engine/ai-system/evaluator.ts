import type { AIGameState, PersonalityProfile } from "./types";

const normalized = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const currentAttack = (card: any) => Math.max(0, Number(card?.atk || 0) + Number(card?.bonusAtk || 0) + Number(card?.temporaryAtk || 0));
const currentHealth = (card: any) => Math.max(0, Number(card?.hp || 0) + Number(card?.bonusHp || 0) + Number(card?.temporaryHp || 0) - Number(card?.damage || 0));
const allPermanents = (player: any) => [...(player.board || []), ...(player.support || []), ...(player.terrain ? [player.terrain] : [])];
const textOf = (card: any) => normalized(`${card?.text || ""} ${(card?.tags || []).join(" ")}`);

const keywordScore = (card: any) => {
  const text = textOf(card);
  let score = 0;
  if (/roubo de vida/.test(text)) score += 2.1;
  if (/barreira magica|indestrutivel/.test(text)) score += 2;
  if (/toque da morte/.test(text)) score += 1.8;
  if (/veloz|investida|furtivo|voar/.test(text)) score += 1.2;
  if (/atropelar|alerta|robusto/.test(text)) score += 0.9;
  if (/primeiro ato|ultimo suspiro|fura-fila/.test(text)) score += 0.75;
  if (card?.suffocated || card?.stunned || card?.frozen || card?.immobilized) score -= 1.4;
  return score;
};

const cardHandValue = (card: any) => {
  const text = textOf(card);
  let value = Number(card?.cost || 0) * 0.42 + Number(card?.atk || 0) * 0.55 + Number(card?.hp || 0) * 0.38;
  if (/compre|busque|procure|investigue/.test(text)) value += 1.7;
  if (/destrua|bana|cause .*dano|retorne/.test(text)) value += 1.9;
  if (/acelerado/.test(text)) value += 1.45;
  if (/cure|roubo de vida|previna/.test(text)) value += 1.05;
  if (/primeiro ato|ultimo suspiro|fura-fila/.test(text)) value += 1.2;
  return value;
};

const responseCount = (player: any) => (player.hand || []).filter((card: any) => /acelerado/.test(textOf(card))).length;
const removalCount = (player: any) => (player.hand || []).filter((card: any) => /destrua|bana|cause\s+\d+\s+de dano|retorne/.test(textOf(card))).length;
const synergyScore = (player: any) => {
  const cards = [...(player.hand || []), ...(player.board || []), ...(player.support || [])];
  const hero = player.heroId;
  if (hero === "goblin") return cards.filter((card: any) => /goblin|fura-fila/.test(textOf(card))).length * 0.8;
  if (hero === "uruk") return cards.filter((card: any) => card.type === "Feitiço" || /elemento/.test(textOf(card))).length * 0.72;
  if (hero === "gimble") return cards.filter((card: any) => /dragao/.test(textOf(card))).length * 0.75;
  if (hero === "tifon") return cards.filter((card: any) => /ultimo suspiro|sacrif/.test(textOf(card))).length * 0.78;
  if (hero === "saymon") return cards.filter((card: any) => /vampiro|roubo de vida|perca .*vida|pague .*vida/.test(textOf(card))).length * 0.76;
  if (hero === "rasmus") return cards.filter((card: any) => /gato|cafe/.test(textOf(card))).length * 0.72;
  if (hero === "quarion") return cards.filter((card: any) => /primeiro ato/.test(textOf(card))).length * 0.8;
  return 0;
};

export interface EvaluationBreakdown {
  total: number;
  life: number;
  lethal: number;
  board: number;
  hand: number;
  resources: number;
  tempo: number;
  interaction: number;
  synergy: number;
  risk: number;
}

export class Evaluator {
  evaluate(state: AIGameState, owner: number, profile: PersonalityProfile, noise = 0): number {
    return this.breakdown(state, owner, profile, noise).total;
  }

  breakdown(state: AIGameState, owner: number, profile: PersonalityProfile, noise = 0): EvaluationBreakdown {
    if (state.winner === owner) return { total: 1_000_000, life: 0, lethal: 1_000_000, board: 0, hand: 0, resources: 0, tempo: 0, interaction: 0, synergy: 0, risk: 0 };
    if (state.winner != null && state.winner !== owner) return { total: -1_000_000, life: 0, lethal: -1_000_000, board: 0, hand: 0, resources: 0, tempo: 0, interaction: 0, synergy: 0, risk: 0 };

    const me = state.players[owner], foe = state.players[1 - owner], w = profile.weights;
    const ownAttack = (me.board || []).reduce((sum: number, card: any) => sum + currentAttack(card), 0);
    const enemyAttack = (foe.board || []).reduce((sum: number, card: any) => sum + currentAttack(card), 0);
    const ownHealth = (me.board || []).reduce((sum: number, card: any) => sum + currentHealth(card), 0);
    const enemyHealth = (foe.board || []).reduce((sum: number, card: any) => sum + currentHealth(card), 0);
    const ownKeywords = allPermanents(me).reduce((sum: number, card: any) => sum + keywordScore(card), 0);
    const enemyKeywords = allPermanents(foe).reduce((sum: number, card: any) => sum + keywordScore(card), 0);

    const life = (me.life - foe.life) * w.life;
    const immediateLethal = ownAttack >= foe.life ? w.lethal : 0;
    const exposedToLethal = enemyAttack >= me.life ? -w.lethal * 1.25 : 0;
    const lethal = immediateLethal + exposedToLethal;
    const board = (ownAttack - enemyAttack) * w.boardAttack + (ownHealth - enemyHealth) * w.boardHealth + (ownKeywords - enemyKeywords) * w.keywords;
    const hand = ((me.hand || []).reduce((sum: number, card: any) => sum + cardHandValue(card), 0) - (foe.hand || []).reduce((sum: number, card: any) => sum + cardHandValue(card), 0)) * w.handValue;
    const resources = ((Number(me.energy || 0) + Number(me.reserve || 0) * w.reserveValue) - (Number(foe.energy || 0) + Number(foe.reserve || 0) * w.reserveValue)) * w.energyEfficiency;
    const tempo = ((me.board || []).length - (foe.board || []).length + (state.active === owner ? 0.4 : -0.15)) * w.tempo;
    const interaction = ((removalCount(me) - removalCount(foe)) * w.removal + (responseCount(me) - responseCount(foe)) * w.responseValue);
    const synergy = (synergyScore(me) - synergyScore(foe)) * w.synergy;

    const ownBoardCount = (me.board || []).length;
    const enemySweepSignals = (foe.hand || []).filter((card: any) => /todas? .*criaturas|cada criatura/.test(textOf(card))).length;
    const overextension = Math.max(0, ownBoardCount - 3) * enemySweepSignals * w.overextensionPenalty;
    const lowLifeRisk = me.life <= 8 ? (9 - me.life) * (1 - profile.riskTolerance) * 1.2 : 0;
    const risk = -(overextension + lowLifeRisk);

    const randomNoise = noise > 0 ? (Math.random() * 2 - 1) * noise * Math.max(1, Math.abs(life + board + hand) * 0.1) : 0;
    const total = life + lethal + board + hand + resources + tempo + interaction + synergy + risk + randomNoise;
    return { total, life, lethal, board, hand, resources, tempo, interaction, synergy, risk };
  }

  estimateLethal(state: AIGameState, owner: number): { lethal: boolean; damage: number; margin: number } {
    const me = state.players[owner], foe = state.players[1 - owner];
    const readyAttack = (me.board || []).filter((card: any) => !card.exhausted && !card.summoning && !card.stunned && !card.immobilized).reduce((sum: number, card: any) => sum + currentAttack(card), 0);
    const burn = (me.hand || []).reduce((sum: number, card: any) => {
      const match = textOf(card).match(/cause\s+(\d+)\s+de dano/);
      return sum + (match ? Number(match[1]) : 0);
    }, 0);
    const damage = readyAttack + burn;
    return { lethal: damage >= foe.life, damage, margin: damage - foe.life };
  }
}

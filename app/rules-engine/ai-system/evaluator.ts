import type { AIGameState, PersonalityProfile } from "./types";

const normalized = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const currentAttack = (card: any) => Math.max(0, Number(card?.atk || 0) + Number(card?.bonusAtk || 0) + Number(card?.temporaryAtk || 0) + (card?.modifiers || []).reduce((sum: number, item: any) => sum + Number(item?.attack || 0), 0));
const currentHealth = (card: any) => Math.max(0, Number(card?.hp || 0) + Number(card?.bonusHp || 0) + Number(card?.temporaryHp || 0) + (card?.modifiers || []).reduce((sum: number, item: any) => sum + Number(item?.health || 0), 0) - Number(card?.damage || 0));
const allPermanents = (player: any) => [...(player.board || []), ...(player.support || []), ...(player.terrain ? [player.terrain] : [])];
const textOf = (card: any) => normalized(`${card?.text || ""} ${(card?.tags || []).join(" ")} ${(card?.temporaryTags || []).join(" ")} ${(card?.grantedKeywords || []).join(" ")}`);
const attacksUsed = (card: any) => Number(card?.attacksThisTurn ?? (card?.attackedThisTurn ? 1 : 0));
const attackReady = (card: any) => !!card && !card.cannotAttack && !card.exhausted && !card.summoning && !card.stunned && !card.immobilized && attacksUsed(card) < Number(card.attackLimit || 1);

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
const removalCount = (player: any) => (player.hand || []).filter((card: any) => /destrua|bana|cause\s+\d+\s+de dano|retorne|sufocad|congelad|atordoad/.test(textOf(card))).length;
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
  if (hero === "tessalia") return cards.filter((card: any) => /comandante|recruta|ataque/.test(textOf(card))).length * 0.55;
  if (hero === "ngoro") return cards.filter((card: any) => /investig|triture|pista|furtivo/.test(textOf(card))).length * 0.68;
  if (hero === "zayan") return cards.filter((card: any) => card.type === "Criatura" && !String(card.text || "").trim()).length * 0.82;
  if (hero === "natureza") return cards.filter((card: any) => /marcador/.test(textOf(card)) || Number(card?.markers || 0) > 0).length * 0.7;
  return 0;
};

const resourceScore = (player: any, phase: string, active: boolean, reserveWeight: number) => {
  const energy = Number(player.energy || 0), reserve = Number(player.reserve || 0), maxEnergy = Number(player.maxEnergy || energy || 0);
  const optionValue = energy * (active && phase === "principal" ? 0.58 : 0.28) + reserve * reserveWeight;
  const reserveSpace = Math.max(0, 3 - reserve);
  const endWaste = active && phase === "fim" ? Math.max(0, energy - reserveSpace) : 0;
  const severeWaste = endWaste * 1.35;
  const spentEfficiency = active && phase === "fim" && maxEnergy > 0 ? Math.min(maxEnergy, maxEnergy - energy) / maxEnergy : 0;
  return optionValue + spentEfficiency - severeWaste;
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
    const ownReadyAttack = (me.board || []).filter(attackReady).reduce((sum: number, card: any) => sum + currentAttack(card), 0);
    const enemyReadyAttack = (foe.board || []).filter(attackReady).reduce((sum: number, card: any) => sum + currentAttack(card), 0);
    const ownHealth = (me.board || []).reduce((sum: number, card: any) => sum + currentHealth(card), 0);
    const enemyHealth = (foe.board || []).reduce((sum: number, card: any) => sum + currentHealth(card), 0);
    const ownKeywords = allPermanents(me).reduce((sum: number, card: any) => sum + keywordScore(card), 0);
    const enemyKeywords = allPermanents(foe).reduce((sum: number, card: any) => sum + keywordScore(card), 0);

    const life = (Number(me.life || 0) - Number(foe.life || 0)) * w.life;
    const immediateLethal = state.active === owner && ownReadyAttack >= Number(foe.life || 0) ? w.lethal : 0;
    const exposedToLethal = state.active !== owner && enemyReadyAttack >= Number(me.life || 0) ? -w.lethal * 1.25 : 0;
    const lethalPressure = Math.max(0, ownReadyAttack - Number(foe.life || 0) * 0.55) * w.lethal * 0.035;
    const lethal = immediateLethal + exposedToLethal + lethalPressure;
    const board = (ownAttack - enemyAttack) * w.boardAttack + (ownHealth - enemyHealth) * w.boardHealth + (ownKeywords - enemyKeywords) * w.keywords;
    const hand = ((me.hand || []).reduce((sum: number, card: any) => sum + cardHandValue(card), 0) - (foe.hand || []).reduce((sum: number, card: any) => sum + cardHandValue(card), 0)) * w.handValue;
    const ownResource = resourceScore(me, state.phase, state.active === owner, w.reserveValue);
    const enemyResource = resourceScore(foe, state.phase, state.active === 1 - owner, w.reserveValue);
    const resources = (ownResource - enemyResource) * w.energyEfficiency;
    const boardDelta = (me.board || []).length - (foe.board || []).length;
    const initiative = state.active === owner ? (state.phase === "principal" ? 0.65 : state.phase === "combate" ? 0.9 : 0.25) : -0.2;
    const tempo = (boardDelta + initiative + (ownReadyAttack - enemyReadyAttack) * 0.12) * w.tempo;
    const interaction = ((removalCount(me) - removalCount(foe)) * w.removal + (responseCount(me) - responseCount(foe)) * w.responseValue);
    const heroLevelValue = (Number(me.level || 1) - Number(foe.level || 1)) * 4.5;
    const synergy = (synergyScore(me) - synergyScore(foe)) * w.synergy + heroLevelValue;

    const ownBoardCount = (me.board || []).length;
    // This operates on a determinized state during search; callers that evaluate
    // public root states must determinize first (enforced by AIController).
    const enemySweepSignals = (foe.hand || []).filter((card: any) => /todas? .*criaturas|cada criatura/.test(textOf(card))).length;
    const overextension = Math.max(0, ownBoardCount - 3) * enemySweepSignals * w.overextensionPenalty;
    const lowLifeRisk = Number(me.life || 0) <= 8 ? (9 - Number(me.life || 0)) * (1 - profile.riskTolerance) * 1.2 : 0;
    const handCapRisk = Math.max(0, (me.hand || []).length - 8) * 0.8;
    const risk = -(overextension + lowLifeRisk + handCapRisk);

    const randomNoise = noise > 0 ? (Math.random() * 2 - 1) * noise * Math.max(1, Math.abs(life + board + hand) * 0.1) : 0;
    const total = life + lethal + board + hand + resources + tempo + interaction + synergy + risk + randomNoise;
    return { total, life, lethal, board, hand, resources, tempo, interaction, synergy, risk };
  }

  estimateLethal(state: AIGameState, owner: number): { lethal: boolean; damage: number; margin: number } {
    const me = state.players[owner], foe = state.players[1 - owner];
    const readyAttack = (me.board || []).filter(attackReady).reduce((sum: number, card: any) => sum + currentAttack(card), 0);
    const availableEnergy = Number(me.energy || 0) + Number(me.reserve || 0);
    const burnCards = (me.hand || []).map((card: any) => {
      const match = textOf(card).match(/cause\s+(\d+)\s+de dano/);
      return { damage: match ? Number(match[1]) : 0, cost: Number(card?.cost || 0) };
    }).filter((item: any) => item.damage > 0).sort((a: any, b: any) => (b.damage / Math.max(1, b.cost)) - (a.damage / Math.max(1, a.cost)));
    let budget = availableEnergy, burn = 0;
    for (const card of burnCards) if (card.cost <= budget) { budget -= card.cost; burn += card.damage; }
    const damage = readyAttack + burn;
    return { lethal: damage >= Number(foe.life || 0), damage, margin: damage - Number(foe.life || 0) };
  }
}

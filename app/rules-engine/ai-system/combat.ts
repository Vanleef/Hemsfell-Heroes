import type { AIGameState, PersonalityProfile } from "./types";

const idOf = (card: any) => String(card?.uid ?? card?.id ?? "");
const atk = (card: any) => Math.max(0, Number(card?.atk || 0) + Number(card?.bonusAtk || 0) + Number(card?.temporaryAtk || 0));
const hp = (card: any) => Math.max(0, Number(card?.hp || 0) + Number(card?.bonusHp || 0) + Number(card?.temporaryHp || 0) - Number(card?.damage || 0));
const ready = (card: any) => !card?.exhausted && !card?.summoning && !card?.stunned && !card?.immobilized;
const text = (card: any) => String(`${card?.text || ""} ${(card?.tags || []).join(" ")}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const has = (card: any, keyword: string) => text(card).includes(keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());

export interface AttackPlan { attackerId: string; preferredDefenderId?: string; directScore: number; }
export interface BlockPlan { attackerId: string; defenderId?: string; takeDamage: boolean; score: number; }

export class CombatPlanner {
  findLethal(state: AIGameState, owner: number): AttackPlan[] | null {
    const me = state.players[owner], foe = state.players[1 - owner];
    const attackers = (me.board || []).filter(ready).sort((a: any, b: any) => atk(b) - atk(a));
    if (!attackers.length) return null;
    const blockers = (foe.board || []).filter((card: any) => !card.exhausted && !card.stunned);
    const unblockable = attackers.filter((card: any) => has(card, "furtivo") || (!blockers.some((blocker: any) => !has(card, "voar") || has(blocker, "voar"))));
    const guaranteed = unblockable.reduce((sum: number, card: any) => sum + atk(card), 0);
    const trampleFloor = attackers.filter((card: any) => has(card, "atropelar")).reduce((sum: number, card: any) => sum + Math.max(0, atk(card) - Math.max(0, ...blockers.map((b: any) => hp(b)))), 0);
    if (guaranteed + trampleFloor < foe.life && blockers.length >= attackers.length) return null;
    return attackers.map((card: any) => ({ attackerId: idOf(card), directScore: atk(card) + (has(card, "furtivo") ? 6 : 0) + (has(card, "atropelar") ? 4 : 0) }));
  }

  planAttacks(state: AIGameState, owner: number, profile: PersonalityProfile): AttackPlan[] {
    const lethal = this.findLethal(state, owner);
    if (lethal) return lethal;
    const me = state.players[owner], foe = state.players[1 - owner], blockers = foe.board || [];
    return (me.board || []).filter(ready).map((card: any) => {
      const power = atk(card), health = hp(card);
      const trade = blockers.map((blocker: any) => ({ blocker, swing: (power >= hp(blocker) ? atk(blocker) + hp(blocker) * .4 : 0) - (atk(blocker) >= health ? power + health * .35 : 0) })).sort((a: any, b: any) => b.swing - a.swing)[0];
      const directScore = power * (1 + profile.aggression) + (has(card, "furtivo") ? 5 : 0) + (has(card, "atropelar") ? 3 : 0) + (trade?.swing || 0) * profile.tradePreference;
      return { attackerId: idOf(card), preferredDefenderId: trade?.swing > 0 ? idOf(trade.blocker) : undefined, directScore };
    }).filter((plan) => plan.directScore > (1 - profile.aggression) * 4).sort((a, b) => b.directScore - a.directScore);
  }

  chooseBlock(state: AIGameState, owner: number, attacker: any, profile: PersonalityProfile): BlockPlan {
    const me = state.players[owner];
    const candidates = (me.board || []).filter((card: any) => !card.exhausted && !card.stunned && (!has(attacker, "voar") || has(card, "voar")));
    const incoming = atk(attacker);
    const takeDamageScore = -incoming * (me.life <= incoming ? 100 : me.life <= 10 ? 2.2 : 1) * (1 - profile.riskTolerance * .35);
    let best: BlockPlan = { attackerId: idOf(attacker), takeDamage: true, score: takeDamageScore };
    for (const defender of candidates) {
      const killAttacker = atk(defender) >= hp(attacker);
      const loseDefender = incoming >= hp(defender);
      const score = (killAttacker ? atk(attacker) + hp(attacker) * .6 : 0) - (loseDefender ? atk(defender) + hp(defender) * .55 : 0) + profile.tradePreference * 2;
      if (score > best.score) best = { attackerId: idOf(attacker), defenderId: idOf(defender), takeDamage: false, score };
    }
    return best;
  }
}

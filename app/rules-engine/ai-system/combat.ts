import { hasCombatKeyword, listAttackCapableCreatures, listLegalBlockers } from "../combat.mjs";
import type { AIGameState, PersonalityProfile } from "./types";

const idOf = (card: any) => String(card?.uid ?? card?.id ?? "");
const atk = (card: any) => Math.max(0, Number(card?.atk || 0) + Number(card?.bonusAtk || 0) + Number(card?.temporaryAtk || 0));
const hp = (card: any) => Math.max(0, Number(card?.hp || 0) + Number(card?.bonusHp || 0) + Number(card?.temporaryHp || 0) - Number(card?.damage || 0));
const text = (card: any) => String(`${card?.text || ""} ${(card?.tags || []).join(" ")}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const has = (card: any, keyword: string) => hasCombatKeyword(card, keyword) || text(card).includes(keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());

export interface AttackPlan { attackerId: string; preferredDefenderId?: string; directScore: number; }
export interface BlockPlan { attackerId: string; defenderId?: string; takeDamage: boolean; score: number; }

export class CombatPlanner {
  private legalAttackers(state: AIGameState, owner: number): any[] {
    return listAttackCapableCreatures(state as any, owner);
  }

  findLethal(state: AIGameState, owner: number): AttackPlan[] | null {
    const foe = state.players[1 - owner];
    const attackers = this.legalAttackers(state, owner).sort((a: any, b: any) => atk(b) - atk(a));
    if (!attackers.length) return null;
    const blockers = foe.board || [];
    const unblockable = attackers.filter((card: any) => has(card, "furtivo") || listLegalBlockers(state as any, 1 - owner, card).length === 0);
    const guaranteed = unblockable.reduce((sum: number, card: any) => sum + atk(card), 0);
    const trampleFloor = attackers.filter((card: any) => has(card, "atropelar")).reduce((sum: number, card: any) => sum + Math.max(0, atk(card) - Math.max(0, ...blockers.map((b: any) => hp(b)))), 0);
    if (guaranteed + trampleFloor < foe.life && blockers.length >= attackers.length) return null;
    return attackers.map((card: any) => ({ attackerId: idOf(card), directScore: atk(card) + (has(card, "furtivo") ? 6 : 0) + (has(card, "atropelar") ? 4 : 0) }));
  }

  private scoreAttacks(state: AIGameState, owner: number, profile: PersonalityProfile): AttackPlan[] {
    const lethal = this.findLethal(state, owner);
    if (lethal) return lethal;
    const foe = state.players[1 - owner], blockers = foe.board || [];
    return this.legalAttackers(state, owner).map((card: any) => {
      const power = atk(card), health = hp(card);
      const legalBlockerIds = new Set(listLegalBlockers(state as any, 1 - owner, card).map((unit: any) => idOf(unit)));
      const trade = blockers.filter((blocker: any) => legalBlockerIds.has(idOf(blocker))).map((blocker: any) => ({ blocker, swing: (power >= hp(blocker) ? atk(blocker) + hp(blocker) * .4 : 0) - (atk(blocker) >= health ? power + health * .35 : 0) })).sort((a: any, b: any) => b.swing - a.swing)[0];
      const directScore = power * (1 + profile.aggression) + (has(card, "furtivo") ? 5 : 0) + (has(card, "atropelar") ? 3 : 0) + (trade?.swing || 0) * profile.tradePreference;
      return { attackerId: idOf(card), preferredDefenderId: trade?.swing > 0 ? idOf(trade.blocker) : undefined, directScore };
    }).filter((plan) => plan.directScore > (1 - profile.aggression) * 4).sort((a, b) => b.directScore - a.directScore);
  }

  /** Compatibility surface now returns at most one action. Callers re-enter
      after that attack resolves and evaluate the new board from scratch. */
  planAttacks(state: AIGameState, owner: number, profile: PersonalityProfile): AttackPlan[] {
    const chosen = this.chooseAttack(state, owner, profile);
    return chosen ? [chosen] : [];
  }

  chooseAttack(state: AIGameState, owner: number, profile: PersonalityProfile, difficulty = "Normal"): AttackPlan | null {
    const attackers = this.legalAttackers(state, owner);
    if (!attackers.length) return null;
    const mandatory = attackers.filter((card: any) => has(card, "indomavel") || has(card, "indomável"));
    const plans = this.scoreAttacks(state, owner, profile);
    if (mandatory.length) {
      const mandatoryIds = new Set(mandatory.map(idOf));
      return plans.find((plan) => mandatoryIds.has(plan.attackerId)) || { attackerId: idOf(mandatory[0]), directScore: Number.POSITIVE_INFINITY };
    }
    if (!plans.length) return null;
    if (/facil|fácil|easy/i.test(difficulty) && plans.length > 1) return plans[Math.min(plans.length - 1, Math.floor(Math.random() * Math.min(3, plans.length)))] || plans[0];
    return plans[0];
  }

  chooseBlock(state: AIGameState, owner: number, attacker: any, profile: PersonalityProfile): BlockPlan {
    const me = state.players[owner];
    const candidates = listLegalBlockers(state as any, owner, attacker);
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

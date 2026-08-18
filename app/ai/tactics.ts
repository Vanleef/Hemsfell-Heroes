import { intrinsicCardValue } from "./evaluator";
import type { AIAction, AICard, AIGameState, GameAdapter, PlayerId, PlaystyleProfile } from "./types";

const fold = (value: unknown): string => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const cardKey = (card: AICard): string => `${card.page ?? ""}:${card.name}`;

export interface LethalResult<A> {
  forced: boolean;
  firstAction: A | null;
  line: A[];
  nodes: number;
}

export class LethalAnalyzer<S extends AIGameState, A extends AIAction> {
  constructor(private readonly adapter: GameAdapter<S, A>) {}

  findForcedLethal(state: S, owner: PlayerId, maxDepth = 6, nodeBudget = 240): LethalResult<A> {
    let nodes = 0;
    const memo = new Map<string, boolean>();
    const path: A[] = [];
    let winningLine: A[] = [];

    const solve = (position: S, depth: number): boolean => {
      nodes += 1;
      if (nodes > nodeBudget) return false;
      const winner = this.adapter.winner(position);
      if (winner != null) return winner === owner;
      if (depth <= 0) return false;
      const actor = this.adapter.actorToMove(position);
      if (actor == null) return false;
      const key = `${this.adapter.stateKey?.(position) ?? JSON.stringify([position.active, position.phase, position.round, position.players.map(player => [player.life, player.hand.length, player.board.length, player.energy, player.reserve])])}|${actor}|${depth}`;
      const cached = memo.get(key);
      if (cached != null) return cached;
      const actions = this.adapter.legalActions(position, actor);
      if (!actions.length) return false;

      if (actor === owner) {
        for (const action of actions) {
          const result = this.adapter.apply(position, action);
          if (!result.legal) continue;
          path.push(action);
          if (solve(result.state, depth - 1)) {
            winningLine = [...path];
            path.pop();
            memo.set(key, true);
            return true;
          }
          path.pop();
        }
        memo.set(key, false);
        return false;
      }

      // A forced lethal must survive every legal defensive response.
      let sawLegal = false;
      for (const action of actions) {
        const result = this.adapter.apply(position, action);
        if (!result.legal) continue;
        sawLegal = true;
        path.push(action);
        const survives = solve(result.state, depth - 1);
        path.pop();
        if (!survives) {
          memo.set(key, false);
          return false;
        }
      }
      memo.set(key, sawLegal);
      return sawLegal;
    };

    const forced = solve(state, maxDepth);
    return { forced, firstAction: forced ? winningLine[0] ?? null : null, line: forced ? winningLine : [], nodes };
  }
}

export interface MulliganPlan {
  keepIds: string[];
  replaceIds: string[];
  scoreByCard: Record<string, number>;
}

export class MulliganPlanner {
  plan(hand: readonly AICard[], heroId: string, opponentHeroId: string, profile: PlaystyleProfile): MulliganPlan {
    const scores = new Map<string, number>();
    const subtypeCounts = new Map<string, number>();
    for (const card of hand) for (const subtype of card.subtypes ?? []) subtypeCounts.set(fold(subtype), (subtypeCounts.get(fold(subtype)) ?? 0) + 1);

    for (const card of hand) {
      const text = fold(`${card.text ?? ""} ${(card.tags ?? []).join(" ")} ${(card.subtypes ?? []).join(" ")}`);
      const cost = Number(card.cost ?? 0);
      let score = 4.2 - Math.max(0, cost - 2) * 1.05 + Math.min(cost, 3) * .18;
      if (cost <= 2) score += profile.id === "aggro" || profile.id === "tempo" ? 1.5 : .8;
      if (cost >= 6) score -= profile.id === "control" || profile.id === "combo-value" ? 1 : 2.35;
      if (/compre|busque|procure|investigue/.test(text)) score += profile.id === "control" || profile.id === "combo-value" ? 1.15 : .45;
      if (/destrua|bana|cause\s+\d+\s+de dano|atordoad|sufocad/.test(text)) score += /goblin|tessalia|zayan/.test(opponentHeroId) ? 1.15 : .55;
      if (/acelerado/.test(text) && profile.holdResponseBias > .65) score += .8;
      if (heroId === "gimble" && /dragao/.test(text)) score += 1.1;
      if (heroId === "goblin" && /goblin|fura-fila/.test(text)) score += 1.05;
      if (heroId === "uruk" && card.type === "Feitiço") score += .9;
      if (heroId === "tifon" && /ultimo suspiro/.test(text)) score += .9;
      if (heroId === "saymon" && /vampiro|roubo de vida/.test(text)) score += .75;
      if (heroId === "quarion" && /primeiro ato/.test(text)) score += .9;
      if (heroId === "rasmus" && /gato|cafe/.test(text)) score += .9;
      if (heroId === "ngoro" && /investig|tritur/.test(text)) score += .8;
      if (heroId === "zayan" && !(card.text ?? "").trim()) score += 1;
      if (heroId === "natureza" && /marcador/.test(text)) score += .75;
      for (const subtype of card.subtypes ?? []) if ((subtypeCounts.get(fold(subtype)) ?? 0) >= 2) score += .25;
      scores.set(card.id, score);
    }

    const curve = hand.filter(card => Number(card.cost ?? 0) <= 3).length;
    const threshold = curve <= 2 ? 3.7 : 3.15;
    const keep = hand.filter(card => (scores.get(card.id) ?? 0) >= threshold);
    // Avoid keeping a hand made entirely of the same expensive/value piece.
    const seen = new Map<string, number>();
    const keepIds = keep.filter(card => {
      const key = cardKey(card), count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      return count <= (Number(card.cost ?? 0) <= 2 ? 2 : 1);
    }).map(card => card.id);
    const keepSet = new Set(keepIds);
    return { keepIds, replaceIds: hand.filter(card => !keepSet.has(card.id)).map(card => card.id), scoreByCard: Object.fromEntries(scores) };
  }

  shouldFullMulligan(hand: readonly AICard[], plan: MulliganPlan): boolean {
    if (hand.length <= 1) return false;
    return plan.keepIds.length < Math.max(2, Math.floor(hand.length * .42));
  }
}

export class CombatPlanner {
  chooseBestBlock(attacker: AICard, blockers: readonly AICard[], defenderLife: number, profile: PlaystyleProfile): AICard | null {
    const attack = Number(attacker.atk ?? 0);
    if (!blockers.length) return null;
    const scored = blockers.map(blocker => {
      const blockHealth = Number(blocker.hp ?? 0) - Number(blocker.damage ?? 0);
      const blockAttack = Number(blocker.atk ?? 0);
      const dies = attack >= blockHealth;
      const kills = blockAttack >= Number(attacker.hp ?? 0) - Number(attacker.damage ?? 0);
      const prevented = Math.min(attack, Math.max(0, defenderLife));
      const valueLoss = dies ? intrinsicCardValue(blocker) : 0;
      const tradeGain = kills ? intrinsicCardValue(attacker) : 0;
      const score = prevented * (defenderLife <= 8 ? 1.8 : .75) + tradeGain * profile.tradePreference - valueLoss * (1.2 - profile.tradePreference * .45);
      return { blocker, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].blocker : null;
  }
}

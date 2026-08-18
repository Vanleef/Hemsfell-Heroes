import { buildAIActionCandidates as legacyCandidates, chooseAIDecision, chooseAIHeroAbility, completeAIPlayCommand } from "../rules-engine/ai-legacy.mjs";
import { executeCommand } from "../rules-engine/engine.mjs";
import { legalPriorityResponses } from "../rules-engine/priority.mjs";
import type { AIAction, AIGameState, AppliedAction, GameAdapter, PlayerId } from "./types";

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)]));
};

const legacyDifficulty = (difficulty: string): string => difficulty === "Easy" ? "Fácil" : difficulty === "Normal" ? "Normal" : "Difícil";
const objectOwner = (owner: PlayerId): PlayerId => owner === 0 ? 1 : 0;

function heroIntentToCommand(intent: Record<string, unknown> | null | undefined, owner: PlayerId): AIAction | null {
  if (!intent) return null;
  const kind = String(intent.kind ?? "");
  const abilityId = kind === "gimble-ready" ? "gimble-level-2"
    : kind === "saymon-lifesteal" ? "saymon-level-2"
    : kind === "saymon-damage" ? "saymon-level-1"
    : kind === "ngoro-stealth" ? "ngoro-level-3"
    : kind === "ngoro-clue-action" ? "ngoro-level-2"
    : kind === "nature-markers" ? "natureza-level-1" : "";
  if (!abilityId) return null;
  const targetId = typeof intent.targetId === "string" ? intent.targetId : undefined;
  return { type: "activateHero", owner, abilityId, targetIds: targetId ? [targetId] : [] };
}

export class HemsfellGameAdapter implements GameAdapter<AIGameState, AIAction> {
  constructor(private readonly difficulty = "Hard") {}

  clone(state: AIGameState): AIGameState {
    return structuredClone(state);
  }

  legalActions(state: AIGameState, actor: PlayerId): AIAction[] {
    if (state.winner != null) return [];
    const difficulty = legacyDifficulty(this.difficulty);
    const candidates: AIAction[] = [];

    if (state.pendingResponse?.responder === actor) {
      for (const command of legalPriorityResponses(state, actor) as AIAction[]) {
        if (command.type === "playCard") {
          const cardId = String(command.cardId ?? "");
          const card = state.players[actor].hand.find(item => item.id === cardId || item.uid === cardId);
          const completed = card ? completeAIPlayCommand(state, actor, card, difficulty, { hasPriority: true }) : null;
          if (completed) candidates.push(completed as AIAction);
        } else candidates.push(command);
      }
      candidates.push({ type: "passPriority", owner: actor, auto: true });
      return this.uniqueLegal(state, this.expandTargetVariants(state, actor, candidates));
    }

    if (state.pendingDecision && (state.pendingDecision.owner === actor || state.pendingDecision.context?.decisionOwner === actor)) {
      const primary = chooseAIDecision(state, actor, difficulty) as AIAction | null;
      if (primary) candidates.push(primary);
      const choices = state.pendingDecision.effect?.choices;
      if (Array.isArray(choices) && ["choice", "draw-position", "repeat-choice"].includes(state.pendingDecision.kind)) {
        choices.forEach((_, choiceIndex) => candidates.push({ type: "resolveDecision", owner: actor, choiceIndex }));
      }
      return this.uniqueLegal(state, this.expandTargetVariants(state, actor, candidates));
    }

    if (state.pendingReposition?.activeOwner === actor) return this.uniqueLegal(state, [{ type: "confirmReposition", owner: actor }]);
    if (state.active !== actor) return [];

    candidates.push(...(legacyCandidates(state, actor, difficulty) as AIAction[]));
    const hero = heroIntentToCommand(chooseAIHeroAbility(state, actor, difficulty) as Record<string, unknown> | null, actor);
    if (hero) candidates.unshift(hero);

    return this.uniqueLegal(state, this.expandTargetVariants(state, actor, candidates));
  }

  apply(state: AIGameState, action: AIAction): AppliedAction<AIGameState> {
    try {
      const result = executeCommand(state, action, { priority: true });
      return { state: result.state as AIGameState, legal: true };
    } catch {
      return { state, legal: false };
    }
  }

  actorToMove(state: AIGameState): PlayerId | null {
    if (state.winner != null) return null;
    if (state.pendingDecision) return (typeof state.pendingDecision.context?.decisionOwner === "number" ? state.pendingDecision.context.decisionOwner : state.pendingDecision.owner) as PlayerId;
    if (state.pendingReposition?.activeOwner != null) return state.pendingReposition.activeOwner;
    if (state.pendingResponse) return state.pendingResponse.responder;
    return state.active;
  }

  isTerminal(state: AIGameState): boolean {
    return state.winner != null || state.players.some(player => player.life <= 0);
  }

  winner(state: AIGameState): PlayerId | null {
    if (state.winner === 0 || state.winner === 1) return state.winner;
    if (state.players[0].life <= 0) return 1;
    if (state.players[1].life <= 0) return 0;
    return null;
  }

  actionKey(action: AIAction): string {
    return JSON.stringify(sorted(action));
  }

  stateKey(state: AIGameState): string {
    return JSON.stringify({
      active: state.active, phase: state.phase, round: state.round,
      life: state.players.map(player => player.life),
      resources: state.players.map(player => [player.energy, player.reserve]),
      zones: state.players.map(player => [player.hand.length, player.deck.length, player.board.map(card => [card.uid, card.damage, card.exhausted]), player.support.map(card => [card.uid, card.exhausted])]),
      response: state.pendingResponse ? [state.pendingResponse.actor, state.pendingResponse.responder, state.pendingResponse.passes] : null,
      decision: state.pendingDecision?.kind ?? null,
    });
  }

  private expandTargetVariants(state: AIGameState, actor: PlayerId, source: AIAction[]): AIAction[] {
    const out: AIAction[] = [...source];
    const opponent = state.players[objectOwner(actor)];
    const publicTargets = state.players.flatMap((player, owner) => [
      ...player.board.map(card => card.uid),
      ...player.support.map(card => card.uid),
      ...(player.terrain ? [player.terrain.uid] : []),
      owner === actor ? "ally-hero" : "enemy-hero",
    ]).filter((id): id is string => !!id);

    for (const action of source) {
      if (action.type === "attack" && typeof action.attackerId === "string") {
        out.push({ ...action, defenderId: undefined });
        for (const defender of opponent.board.slice(0, 5)) out.push({ ...action, defenderId: defender.uid });
        continue;
      }
      if (!["playCard", "activate", "activateHero", "resolveDecision"].includes(action.type)) continue;
      const ids = Array.isArray(action.targetIds) ? action.targetIds.filter((id): id is string => typeof id === "string") : [];
      if (ids.length === 1) {
        for (const targetId of publicTargets.slice(0, 14)) out.push({ ...action, targetIds: [targetId] });
      } else if (ids.length === 2) {
        const pool = publicTargets.slice(0, 8);
        for (let first = 0; first < pool.length; first += 1) for (let second = first + 1; second < pool.length; second += 1) {
          out.push({ ...action, targetIds: [pool[first], pool[second]] });
          if (out.length >= source.length + 40) break;
        }
      }
    }
    return out;
  }

  private uniqueLegal(state: AIGameState, actions: AIAction[]): AIAction[] {
    const seen = new Set<string>();
    const legal: AIAction[] = [];
    for (const action of actions) {
      const key = this.actionKey(action);
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.apply(state, action).legal) legal.push(action);
      if (legal.length >= 48) break;
    }
    return legal;
  }
}

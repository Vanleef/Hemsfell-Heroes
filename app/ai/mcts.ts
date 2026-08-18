import { Evaluator } from "./evaluator";
import { ParticleFilter } from "./belief-model";
import type { AIAction, AIGameState, DifficultyConfig, GameAdapter, PlayerId, PlaystyleProfile, SearchDiagnostics } from "./types";

const now = (): number => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
const yieldToBrowser = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const hasKnownResponse = (state: AIGameState, actor: PlayerId): boolean => state.players[actor].hand.some(card => /acelerado|instant/i.test(`${card.text ?? ""} ${(card.tags ?? []).join(" ")}`) && Number(card.cost ?? 0) <= Number(state.players[actor].reserve ?? 0));

interface SearchNode<A> {
  action: A | null;
  actionKey: string;
  parent: SearchNode<A> | null;
  children: Map<string, SearchNode<A>>;
  visits: number;
  valueSum: number;
}

export interface MCTSResult<A> {
  action: A | null;
  diagnostics: SearchDiagnostics<A>;
}

export class MCTS<S extends AIGameState, A extends AIAction> {
  constructor(
    private readonly adapter: GameAdapter<S, A>,
    private readonly evaluator: Evaluator,
    private readonly belief?: ParticleFilter,
  ) {}

  async search(
    rootState: S,
    owner: PlayerId,
    profile: PlaystyleProfile,
    config: DifficultyConfig,
    random: () => number = Math.random,
    signal?: AbortSignal,
    onProgress?: (message: string, progress: number) => void,
  ): Promise<MCTSResult<A>> {
    const started = now();
    const root: SearchNode<A> = { action: null, actionKey: "root", parent: null, children: new Map(), visits: 0, valueSum: 0 };
    let iterations = 0;
    let determinizations = 0;

    while (iterations < config.iterations && now() - started < config.maxThinkMs) {
      if (signal?.aborted) break;
      let state = this.sampleDeterminization(rootState);
      determinizations += 1;
      let node = root;
      const path: SearchNode<A>[] = [root];
      let depth = 0;

      while (!this.adapter.isTerminal(state) && depth < config.rolloutDepth) {
        const actor = this.adapter.actorToMove(state);
        if (actor == null) break;
        const legal = this.limitActions(state, actor, this.adapter.legalActions(state, actor), owner, profile, config.rootActionLimit);
        if (!legal.length) break;
        const unseen = legal.filter(action => !node.children.has(this.adapter.actionKey(action)));
        let action: A;

        if (unseen.length) {
          action = this.pickExpansionAction(state, actor, unseen, owner, profile, config, random);
          const key = this.adapter.actionKey(action);
          const child: SearchNode<A> = { action, actionKey: key, parent: node, children: new Map(), visits: 0, valueSum: 0 };
          node.children.set(key, child);
          node = child;
          path.push(node);
          const applied = this.adapter.apply(state, action);
          if (!applied.legal) break;
          state = applied.state;
          depth += 1;
          break;
        }

        const candidates = legal.map(action => node.children.get(this.adapter.actionKey(action))).filter((child): child is SearchNode<A> => !!child);
        if (!candidates.length) break;
        const selected = this.selectUCT(candidates, node.visits, actor === owner, config.explorationConstant, random);
        const applied = this.adapter.apply(state, selected.action!);
        if (!applied.legal) {
          selected.visits += 1;
          selected.valueSum -= actor === owner ? .25 : -.25;
          break;
        }
        state = applied.state;
        node = selected;
        path.push(node);
        depth += 1;
      }

      const reward = this.rollout(state, owner, profile, config, depth, random);
      for (const visited of path) {
        visited.visits += 1;
        visited.valueSum += reward;
      }

      iterations += 1;
      if (iterations % config.yieldEveryIterations === 0) {
        onProgress?.("analisando linhas de jogo", Math.min(1, iterations / Math.max(1, config.iterations)));
        await yieldToBrowser();
      }
    }

    const ranked = [...root.children.values()].sort((left, right) => right.visits - left.visits || this.mean(right) - this.mean(left));
    const selected = ranked[0]?.action ?? null;
    const elapsedMs = now() - started;
    return {
      action: selected,
      diagnostics: {
        iterations,
        elapsedMs,
        determinizations,
        root: ranked.map(child => ({ action: child.action!, visits: child.visits, meanValue: this.mean(child) })),
        selectedBy: "mcts",
      },
    };
  }

  private sampleDeterminization(rootState: S): S {
    if (!this.belief) return this.adapter.clone(rootState);
    return this.belief.determinize(rootState) as S;
  }

  private selectUCT(children: SearchNode<A>[], parentVisits: number, maximizing: boolean, exploration: number, random: () => number): SearchNode<A> {
    let best = children[0];
    let bestScore = -Infinity;
    for (const child of children) {
      const mean = child.visits ? child.valueSum / child.visits : 0;
      const exploitation = maximizing ? mean : -mean;
      const bonus = exploration * Math.sqrt(Math.log(Math.max(2, parentVisits + 1)) / Math.max(1, child.visits));
      const score = exploitation + bonus + random() * 1e-7;
      if (score > bestScore) { best = child; bestScore = score; }
    }
    return best;
  }

  private pickExpansionAction(state: S, actor: PlayerId, actions: A[], owner: PlayerId, profile: PlaystyleProfile, config: DifficultyConfig, random: () => number): A {
    if (random() > config.heuristicRolloutProbability) return actions[Math.floor(random() * actions.length)] ?? actions[0];
    return this.rankImmediate(state, actor, actions, owner, profile, random)[0] ?? actions[0];
  }

  private rollout(state: S, owner: PlayerId, profile: PlaystyleProfile, config: DifficultyConfig, currentDepth: number, random: () => number): number {
    let position = state;
    for (let depth = currentDepth; depth < config.rolloutDepth && !this.adapter.isTerminal(position); depth += 1) {
      const actor = this.adapter.actorToMove(position);
      if (actor == null) break;
      const actions = this.limitActions(position, actor, this.adapter.legalActions(position, actor), owner, profile, Math.min(config.rootActionLimit, 10));
      if (!actions.length) break;
      const heuristic = random() < config.heuristicRolloutProbability;
      const action = heuristic ? this.rankImmediate(position, actor, actions, owner, profile, random)[0] : actions[Math.floor(random() * actions.length)];
      if (!action) break;
      const result = this.adapter.apply(position, action);
      if (!result.legal) break;
      position = result.state;
    }
    const base = this.evaluator.evaluate(position, owner, profile).total;
    const noise = (random() * 2 - 1) * config.evaluationNoise;
    return Math.max(-1, Math.min(1, base * config.heuristicStrength + noise));
  }

  private limitActions(state: S, actor: PlayerId, actions: A[], owner: PlayerId, profile: PlaystyleProfile, limit: number): A[] {
    if (actions.length <= limit) return actions;
    return this.rankImmediate(state, actor, actions, owner, profile, Math.random).slice(0, limit);
  }

  private rankImmediate(state: S, actor: PlayerId, actions: A[], owner: PlayerId, profile: PlaystyleProfile, random: () => number): A[] {
    const maximizing = actor === owner;
    const scored = actions.map(action => {
      const result = this.adapter.apply(state, action);
      if (!result.legal) return { action, value: -Infinity };
      let value = this.evaluator.evaluate(result.state, owner, profile).total;
      if (action.type === "advancePhase") {
        const reserve = Number(state.players[actor].reserve ?? 0) + Number(state.players[actor].energy ?? 0);
        const hold = (profile.holdResponseBias - .5) * Math.min(3, reserve) * .015;
        const bluff = !hasKnownResponse(state, actor) && reserve > 0 ? profile.bluffFrequency * Math.min(3, reserve) * .012 : 0;
        value += (hold + bluff) * (maximizing ? 1 : -1);
      }
      if (action.type === "attack") {
        const aggression = (profile.attackAggression - .5) * .08 + (profile.riskTolerance - .5) * .035;
        value += aggression * (maximizing ? 1 : -1);
      }
      return { action, value: (maximizing ? value : -value) + random() * 1e-6 };
    });
    return scored.sort((a, b) => b.value - a.value).map(item => item.action);
  }

  private mean(node: SearchNode<A>): number {
    return node.visits ? node.valueSum / node.visits : 0;
  }
}

import type { AIAction, AIGameState, DifficultyConfig, EngineAdapter, PersonalityProfile, SearchStats } from "./types";
import { BeliefModel } from "./belief";
import { Evaluator } from "./evaluator";

const actorForState = (state: AIGameState, fallback: number): number => {
  const decision = state.pendingDecision as any;
  if (decision) {
    if (typeof decision.context?.decisionOwner === "number") return decision.context.decisionOwner;
    if (typeof decision.owner === "number") return decision.owner;
  }
  const response = state.pendingResponse as any;
  if (response && typeof response.responder === "number") return response.responder;
  return typeof state.active === "number" ? state.active : fallback;
};

class Node {
  readonly parent: Node | null;
  readonly action: AIAction | null;
  readonly actor: number;
  readonly children: Node[] = [];
  untried: AIAction[];
  visits = 0;
  value = 0;

  constructor(parent: Node | null, action: AIAction | null, actions: AIAction[], actor: number) {
    this.parent = parent;
    this.action = action;
    this.untried = actions;
    this.actor = actor;
  }

  mean(): number { return this.visits ? this.value / this.visits : 0; }
}

export interface MCTSOptions {
  state: AIGameState;
  owner: number;
  config: DifficultyConfig;
  personality: PersonalityProfile;
  belief: BeliefModel;
  adapter: EngineAdapter;
  evaluator: Evaluator;
  legacyDifficulty: string;
  random?: () => number;
}

const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export class MCTS {
  async search(options: MCTSOptions): Promise<{ action: AIAction | null; stats: SearchStats }> {
    const { state, owner, config, personality, belief, adapter, evaluator, legacyDifficulty } = options;
    const random = options.random || Math.random;
    const rootActor = actorForState(state, owner);
    const rootActions = adapter.generateLegalActions(state, rootActor, legacyDifficulty);
    const root = new Node(null, null, rootActions, rootActor);
    const started = now();
    let iterations = 0;

    if (!rootActions.length) return { action: null, stats: { iterations: 0, elapsedMs: 0, rootVisits: 0, selectedVisits: 0, selectedMeanValue: 0 } };

    while (iterations < config.iterations && now() - started < config.thinkTimeMs) {
      let simulation = belief.determinize(state, owner);
      let node = root;

      // Selection is adversarial: our nodes maximize root utility while the
      // opponent's nodes minimize it. Decision/priority owners take precedence
      // over `active`, which matters heavily in card-game response windows.
      while (!node.untried.length && node.children.length && simulation.winner == null) {
        node = this.selectUCT(node, owner, config.explorationConstant, random);
        if (!node.action) break;
        const next = this.safeApply(adapter, simulation, node.action);
        if (!next) break;
        simulation = next;
      }

      // Expansion adds one legal move for whoever actually owns the current
      // decision. Invalid commands are discarded from this determinization.
      while (node.untried.length && simulation.winner == null) {
        const index = Math.floor(random() * node.untried.length);
        const action = node.untried.splice(index, 1)[0];
        const next = this.safeApply(adapter, simulation, action);
        if (!next) continue;
        simulation = next;
        const nextActor = actorForState(simulation, owner);
        const actions = adapter.generateLegalActions(simulation, nextActor, legacyDifficulty);
        const child = new Node(node, action, actions, nextActor);
        node.children.push(child);
        node = child;
        break;
      }

      // Simulation uses a bounded hybrid policy. The heuristic portion also
      // switches perspective when the opponent is choosing a response/action.
      simulation = this.rollout(simulation, owner, config, personality, adapter, evaluator, legacyDifficulty, random);
      const reward = evaluator.evaluate(simulation, owner, personality, config.evaluationNoise);

      // Store one consistent root-player utility. Selection flips exploitation
      // according to the actor at each parent node instead of corrupting values.
      let cursor: Node | null = node;
      while (cursor) {
        cursor.visits += 1;
        cursor.value += reward;
        cursor = cursor.parent;
      }

      iterations += 1;
      if (iterations % Math.max(1, config.yieldEvery) === 0) await yieldToBrowser();
    }

    // Root is always the AI's decision in controller usage. Visit count is the
    // most stable criterion under determinization; mean value breaks ties.
    const selected = root.children.toSorted((a, b) => b.visits - a.visits || b.mean() - a.mean())[0];
    return {
      action: selected?.action || rootActions[0] || null,
      stats: {
        iterations,
        elapsedMs: now() - started,
        rootVisits: root.visits,
        selectedVisits: selected?.visits || 0,
        selectedMeanValue: selected?.mean() || 0,
      },
    };
  }

  private selectUCT(node: Node, rootOwner: number, exploration: number, random: () => number): Node {
    const logParent = Math.log(Math.max(1, node.visits));
    const maximize = node.actor === rootOwner;
    let best = node.children[0];
    let bestScore = -Infinity;
    for (const child of node.children) {
      // Values are stored from root perspective, so opponent nodes prefer lower
      // root utility. Exploration remains positive for both sides.
      const exploitation = (maximize ? 1 : -1) * child.mean();
      const explore = child.visits ? exploration * Math.sqrt(logParent / child.visits) : Infinity;
      const score = exploitation + explore + random() * 1e-9;
      if (score > bestScore) { best = child; bestScore = score; }
    }
    return best;
  }

  private rollout(state: AIGameState, rootOwner: number, config: DifficultyConfig, personality: PersonalityProfile, adapter: EngineAdapter, evaluator: Evaluator, difficulty: string, random: () => number): AIGameState {
    let current = state;
    for (let depth = 0; depth < config.rolloutDepth && current.winner == null; depth += 1) {
      const actor = actorForState(current, rootOwner);
      const actions = adapter.generateLegalActions(current, actor, difficulty);
      if (!actions.length) break;

      let action: AIAction;
      if (random() < config.heuristicRolloutChance) {
        const scored = actions.map((candidate) => {
          const next = this.safeApply(adapter, current, candidate);
          if (!next) return { candidate, next: null, score: -Infinity };
          const ownerUtility = evaluator.evaluate(next, rootOwner, personality, 0);
          return { candidate, next, score: actor === rootOwner ? ownerUtility : -ownerUtility };
        }).filter((entry) => !!entry.next);
        scored.sort((a, b) => b.score - a.score);
        if (!scored.length) break;
        const window = Math.min(3, scored.length);
        const pick = random() < 0.82 ? 0 : Math.floor(random() * window);
        action = scored[pick].candidate;
      } else {
        action = actions[Math.floor(random() * actions.length)];
      }

      const next = this.safeApply(adapter, current, action);
      if (!next) break;
      current = next;
    }
    return current;
  }

  private safeApply(adapter: EngineAdapter, state: AIGameState, action: AIAction): AIGameState | null {
    try { return adapter.applyAction(state, action); } catch { return null; }
  }
}

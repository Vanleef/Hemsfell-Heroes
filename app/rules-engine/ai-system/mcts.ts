import type { AIAction, AIGameState, DifficultyConfig, EngineAdapter, PersonalityProfile, SearchStats } from "./types";
import { BeliefModel } from "./belief";
import { Evaluator } from "./evaluator";

class Node {
  readonly parent: Node | null;
  readonly action: AIAction | null;
  readonly children: Node[] = [];
  untried: AIAction[];
  visits = 0;
  value = 0;

  constructor(parent: Node | null, action: AIAction | null, actions: AIAction[]) {
    this.parent = parent;
    this.action = action;
    this.untried = actions;
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

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export class MCTS {
  async search(options: MCTSOptions): Promise<{ action: AIAction | null; stats: SearchStats }> {
    const { state, owner, config, personality, belief, adapter, evaluator, legacyDifficulty } = options;
    const random = options.random || Math.random;
    const rootActions = adapter.generateLegalActions(state, owner, legacyDifficulty);
    const root = new Node(null, null, rootActions);
    const started = performance.now();
    let iterations = 0;

    if (!rootActions.length) return { action: null, stats: { iterations: 0, elapsedMs: 0, rootVisits: 0, selectedVisits: 0, selectedMeanValue: 0 } };

    while (iterations < config.iterations && performance.now() - started < config.thinkTimeMs) {
      let simulation = belief.determinize(state, owner);
      let node = root;

      // Selection: descend through fully expanded nodes using UCT.
      while (!node.untried.length && node.children.length && simulation.winner == null) {
        node = this.selectUCT(node, config.explorationConstant, random);
        if (!node.action) break;
        const next = this.safeApply(adapter, simulation, node.action);
        if (!next) break;
        simulation = next;
      }

      // Expansion: add one legal move not yet represented by the node.
      if (node.untried.length && simulation.winner == null) {
        const index = Math.floor(random() * node.untried.length);
        const action = node.untried.splice(index, 1)[0];
        const next = this.safeApply(adapter, simulation, action);
        if (next) {
          simulation = next;
          const nextOwner = simulation.active ?? owner;
          const actions = adapter.generateLegalActions(simulation, nextOwner, legacyDifficulty);
          const child = new Node(node, action, actions);
          node.children.push(child);
          node = child;
        }
      }

      // Simulation: hybrid policy. 70%+ chooses a heuristic line, the remainder
      // samples a legal move to preserve tactical diversity and bluff-like play.
      simulation = this.rollout(simulation, owner, config, personality, adapter, evaluator, legacyDifficulty, random);
      const reward = evaluator.evaluate(simulation, owner, personality, config.evaluationNoise);

      // Backpropagation always uses root-player utility. Hidden-state samples
      // change between iterations, making visit count the robust final criterion.
      while (node) {
        node.visits += 1;
        node.value += reward;
        node = node.parent as Node;
      }

      iterations += 1;
      if (iterations % config.yieldEvery === 0) await yieldToBrowser();
    }

    const selected = root.children.toSorted((a, b) => b.visits - a.visits || b.mean() - a.mean())[0];
    return {
      action: selected?.action || rootActions[0] || null,
      stats: {
        iterations,
        elapsedMs: performance.now() - started,
        rootVisits: root.visits,
        selectedVisits: selected?.visits || 0,
        selectedMeanValue: selected?.mean() || 0,
      },
    };
  }

  private selectUCT(node: Node, exploration: number, random: () => number): Node {
    const logParent = Math.log(Math.max(1, node.visits));
    let best = node.children[0];
    let bestScore = -Infinity;
    for (const child of node.children) {
      const exploitation = child.mean();
      const explore = child.visits ? exploration * Math.sqrt(logParent / child.visits) : Infinity;
      const score = exploitation + explore + random() * 1e-9;
      if (score > bestScore) { best = child; bestScore = score; }
    }
    return best;
  }

  private rollout(state: AIGameState, rootOwner: number, config: DifficultyConfig, personality: PersonalityProfile, adapter: EngineAdapter, evaluator: Evaluator, difficulty: string, random: () => number): AIGameState {
    let current = state;
    for (let depth = 0; depth < config.rolloutDepth && current.winner == null; depth += 1) {
      const actor = Number(current.active ?? rootOwner);
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
        // Human-like rollout: usually best, occasionally second/third best.
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

import { ParticleFilter } from "./belief-model";
import { difficultyConfig, normalizeDifficulty } from "./config";
import { Evaluator } from "./evaluator";
import { MCTS } from "./mcts";
import { defaultPlaystyleForHero, PLAYSTYLES, selectAdaptivePlaystyle } from "./personality";
import { LethalAnalyzer, MulliganPlanner, type MulliganPlan } from "./tactics";
import type { AIAction, AIDifficulty, AIGameState, AIThinkOptions, AIThinkResult, BeliefObservation, DifficultyInput, GameAdapter, PlayerId, PlaystyleId, PlaystyleProfile, SearchDiagnostics } from "./types";

const now = (): number => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise(resolve => {
  if (ms <= 0 || signal?.aborted) { resolve(); return; }
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

export class AIController<S extends AIGameState, A extends AIAction> {
  readonly belief: ParticleFilter;
  readonly evaluator = new Evaluator();
  readonly mulligan = new MulliganPlanner();
  readonly mcts: MCTS<S, A>;
  readonly lethal: LethalAnalyzer<S, A>;
  private difficulty: AIDifficulty;
  private preferredPlaystyle?: PlaystyleId;
  private random: () => number;

  constructor(
    readonly owner: PlayerId,
    private readonly adapter: GameAdapter<S, A>,
    difficulty: DifficultyInput | string = "Normal",
    options: { personality?: PlaystyleId; random?: () => number } = {},
  ) {
    this.difficulty = normalizeDifficulty(difficulty);
    this.preferredPlaystyle = options.personality;
    this.random = options.random ?? Math.random;
    const config = difficultyConfig(this.difficulty);
    this.belief = new ParticleFilter(owner, config.particleCount, this.random);
    this.mcts = new MCTS(adapter, this.evaluator, this.belief);
    this.lethal = new LethalAnalyzer(adapter);
  }

  setDifficulty(value: DifficultyInput | string): void {
    this.difficulty = normalizeDifficulty(value);
    this.belief.setParticleCount(difficultyConfig(this.difficulty).particleCount);
  }

  setPersonality(value?: PlaystyleId): void {
    this.preferredPlaystyle = value;
  }

  resetBelief(state: S): void {
    this.belief.initialize(state);
  }

  observe(observation: BeliefObservation): void {
    this.belief.observe(observation);
  }

  syncPublicState(state: S): void {
    if (!this.belief.snapshot().length) this.belief.initialize(state);
    else this.belief.observe({ type: "public-snapshot", state });
  }

  async chooseAction(state: S, options: AIThinkOptions = {}): Promise<AIThinkResult<A>> {
    const config = difficultyConfig(this.difficulty);
    const random = options.random ?? this.random;
    this.syncPublicState(state);
    const profile = this.resolveProfile(state, options.personality);
    const started = now();
    options.onProgress?.(`${profile.label}: lendo a mesa`, .08);

    const legal = this.adapter.legalActions(state, this.adapter.actorToMove(state) ?? this.owner);
    if (!legal.length) return { action: null, diagnostics: this.emptyDiagnostics(started, "heuristic") };

    if (this.difficulty !== "Easy") {
      const lethalDepth = this.difficulty === "Normal" ? 3 : this.difficulty === "Hard" ? 4 : this.difficulty === "Expert" ? 5 : 6;
      const lethalBudget = this.difficulty === "Normal" ? 60 : this.difficulty === "Hard" ? 120 : this.difficulty === "Expert" ? 220 : 360;
      const forced = this.lethal.findForcedLethal(state, this.owner, lethalDepth, lethalBudget);
      if (forced.forced && forced.firstAction) {
        await this.humanDelay(started, config.minThinkMs * .55, options.signal);
        return {
          action: forced.firstAction,
          diagnostics: { iterations: forced.nodes, elapsedMs: now() - started, determinizations: 0, root: [{ action: forced.firstAction, visits: forced.nodes, meanValue: 1 }], selectedBy: "forced-lethal" },
        };
      }
    }

    if (this.difficulty === "Easy" || config.iterations === 0) {
      const action = this.chooseHeuristic(state, legal, profile, config.evaluationNoise, random, true);
      await this.humanDelay(started, config.minThinkMs, options.signal);
      return { action, diagnostics: { iterations: 0, elapsedMs: now() - started, determinizations: 0, root: [], selectedBy: "heuristic" } };
    }

    options.onProgress?.(`${profile.label}: simulando respostas prováveis`, .18);
    const result = await this.mcts.search(state, this.owner, profile, config, random, options.signal, options.onProgress);
    let action = result.action;
    let selectedBy: SearchDiagnostics<A>["selectedBy"] = "mcts";

    if (result.diagnostics.root.length > 1 && random() < config.intentionalMistakeRate) {
      const candidates = result.diagnostics.root.slice(0, Math.min(4, result.diagnostics.root.length));
      const best = candidates[0]?.meanValue ?? -1;
      const believable = candidates.filter(candidate => best - candidate.meanValue <= (.18 + config.evaluationNoise * 1.5));
      const pool = believable.length > 1 ? believable.slice(1) : candidates.slice(1, 2);
      if (pool.length) {
        action = pool[Math.floor(random() * pool.length)]?.action ?? action;
        selectedBy = "intentional-mistake";
      }
    }

    await this.humanDelay(started, config.minThinkMs, options.signal);
    options.onProgress?.(`${profile.label}: decisão pronta`, 1);
    return { action, diagnostics: { ...result.diagnostics, elapsedMs: now() - started, selectedBy } };
  }

  chooseMulligan(state: S): MulliganPlan {
    const profile = this.resolveProfile(state);
    const opponent = state.players[this.owner === 0 ? 1 : 0];
    return this.mulligan.plan(state.players[this.owner].hand, state.players[this.owner].heroId, opponent.heroId, profile);
  }

  private resolveProfile(state: S, requested?: PlaystyleId): PlaystyleProfile {
    const preferred = requested ?? this.preferredPlaystyle ?? defaultPlaystyleForHero(state.players[this.owner].heroId);
    const config = difficultyConfig(this.difficulty);
    return config.adaptivePersonality ? selectAdaptivePlaystyle(state, this.owner, preferred) : PLAYSTYLES[preferred];
  }

  private chooseHeuristic(state: S, actions: A[], profile: PlaystyleProfile, noise: number, random: () => number, allowMistake: boolean): A | null {
    const scored = actions.flatMap(action => {
      const result = this.adapter.apply(state, action);
      if (!result.legal) return [];
      let value = this.evaluator.evaluate(result.state, this.owner, profile).total;
      if (action.type === "attack") value += (profile.attackAggression - .5) * .1;
      if (action.type === "advancePhase") value += (profile.holdResponseBias - .5) * Number(state.players[this.owner].reserve ?? 0) * .025;
      value += (random() * 2 - 1) * noise;
      return [{ action, value }];
    }).sort((a, b) => b.value - a.value);
    if (!scored.length) return null;
    if (allowMistake && scored.length > 1 && random() < difficultyConfig(this.difficulty).intentionalMistakeRate) {
      const plausible = scored.filter(item => scored[0].value - item.value < .3).slice(0, 3);
      return plausible[Math.floor(random() * plausible.length)]?.action ?? scored[0].action;
    }
    return scored[0].action;
  }

  private async humanDelay(started: number, targetMs: number, signal?: AbortSignal): Promise<void> {
    const remaining = targetMs - (now() - started);
    if (remaining > 0) await sleep(Math.min(remaining, 650), signal);
  }

  private emptyDiagnostics(started: number, selectedBy: SearchDiagnostics<A>["selectedBy"]): SearchDiagnostics<A> {
    return { iterations: 0, elapsedMs: now() - started, determinizations: 0, root: [], selectedBy };
  }
}

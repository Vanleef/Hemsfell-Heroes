# Hemsfell Advanced AI

This directory contains the next-generation opponent AI. The design deliberately separates **belief**, **search**, **evaluation**, **combat planning**, **personality** and **orchestration** so tuning one concern does not destabilize the others.

## Architecture

```text
AIController
├── BeliefModel / ParticleFilter
├── MCTS (ISMCTS-style determinization per iteration)
├── Evaluator
├── CombatPlanner
├── PersonalityProfile
└── DifficultyConfig
```

### Modules

- `types.ts` — strict contracts for game adapters, particles, difficulty and search telemetry.
- `config.ts` — Easy/Normal/Hard/Expert/Master budgets.
- `personality.ts` — Aggro, Midrange, Control, Tempo and Combo/Value profiles.
- `belief.ts` — particle filter over hidden hand/deck hypotheses.
- `evaluator.ts` — hybrid high-level heuristic and lethal estimator.
- `combat.ts` — lethal, attack ordering and blocking/trade planning.
- `mcts.ts` — Selection → Expansion → Simulation → Backpropagation with UCT and determinization.
- `controller.ts` — public façade, mulligan, intentional mistakes, adaptive Master profile and browser thinking telemetry.

## Imperfect information

The AI never needs to inspect a privileged opponent hand in order to search. `BeliefModel` maintains weighted hypotheses and `MCTS` requests a fresh determinization for each simulation. Public observations should be fed through `AIController.observe()`:

```ts
controller.observe({ type: "play", player: 0, cardId: playedCard.id });
controller.observe({ type: "draw", player: 0, count: 1 });
controller.observe({ type: "discard", player: 0, cardId: discarded.id });
controller.observe({ type: "shuffle", player: 0 });
```

If the game exposes revealed cards, they remain public while the hidden remainder is sampled from particles.

## Search policy

MCTS uses UCT. Each iteration samples one hidden-state hypothesis and performs a bounded rollout. Rollouts are hybrid: the configured heuristic probability selects among the strongest evaluated successors while the remainder samples legal actions. The final root action is selected by **visit count**, not raw value, which is substantially more stable under imperfect information.

The loop periodically yields with `setTimeout(0)`; it therefore does not monopolize the browser main thread. A Worker can later host the same `MCTS` class without changing the evaluation/search contracts.

## Difficulties

| Level | Search | Particles | Mistakes | Intent |
| --- | --- | ---: | ---: | --- |
| Easy | 1-ply heuristic | 6 | 28% | believable beginner |
| Normal | light MCTS | 18 | 10% | competent casual |
| Hard | medium MCTS | 42 | 3.5% | strong player |
| Expert | strong MCTS | 96 | 1% | tournament-like |
| Master | maximum browser budget | 160 | 0% | adaptive expert |

Iteration count, thinking time, rollout depth, UCT constant, noise and yield cadence are all centralized in `config.ts`.

## Personalities

- **Aggro** — maximizes lethal pressure and tempo; accepts bad-value trades to close games.
- **Midrange** — balanced board/value plan with efficient trades.
- **Control** — values life, removal, responses, hand advantage and anti-overextension.
- **Tempo** — maximizes energy efficiency, initiative and short tactical swings.
- **ComboValue** — protects setup pieces, hand value and synergy until an explosive turn.

Hero-to-profile defaults live in `personality.ts`. Master may adapt profile from public game state (for example switching toward aggression when the opponent is low).

## Browser integration

Create one controller for the AI player and reuse it for the match:

```ts
const aiControllerRef = useRef<AIController>();
if (!aiControllerRef.current) aiControllerRef.current = new AIController(difficulty);
aiControllerRef.current.setDifficulty(difficulty);

const result = await aiControllerRef.current.chooseAction(game, 1);
if (result.action) await runRulesCommand(result.action, 1);
```

The controller emits `hemsfell:ai-thinking` while a search is running:

```ts
window.addEventListener("hemsfell:ai-thinking", (event) => {
  const { thinking, difficulty, personality } = (event as CustomEvent).detail;
  // Show/hide the "pensando…" indicator.
});
```

For combat, use `controller.planAttacks(state, 1)` and `controller.chooseBlock(state, 1, attacker)`. For the current whole-hand mulligan model use `controller.shouldKeepMulligan(state, 1)`.

## Calibration

Do not tune weights only by intuition. Log `controller.debugEvaluation(state, owner)` together with the chosen action and match result. Recommended loop:

1. Build a deterministic scenario corpus: lethal puzzles, board trades, response windows, empty-board development, low-life stabilization and hero-specific combo setups.
2. For each scenario define a small acceptable action set instead of exactly one move when multiple lines are strategically equivalent.
3. Run self-play batches with fixed RNG seeds and collect win rate, average game length, damage wasted into overkill, energy left unused, cards lost to hand cap and response cards held at game end.
4. Adjust one weight family at a time (board, tempo, value, risk, interaction).
5. Re-run the entire corpus after every change. A weight is accepted only if it improves target scenarios without regressing unrelated archetypes.
6. Keep Master deterministic enough for debugging by supporting a seeded random source through the MCTS/Belief constructors during test harnesses.

Useful diagnostics are `debugEvaluation()`, MCTS `SearchStats`, `beliefEntropy()`, lethal estimates and personality id. High entropy with very confident tactical choices is a warning sign that the AI may be overfitting one determinization.

## Performance rules

- Search uses bounded time **and** bounded iterations.
- Rollouts have a hard depth cap.
- The main loop yields periodically to the browser.
- Only determinized search states are cloned; evaluation is read-only.
- Root choice uses visit count to reduce noisy hidden-state oscillation.
- Particle count scales by difficulty.
- Search telemetry should be sampled in development, not rendered every iteration.

For a future Web Worker migration, serialize only the minimal game state and action ids. Keep card art/UI data outside worker messages.

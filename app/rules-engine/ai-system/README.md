# Hemsfell Advanced AI

This directory contains the next-generation opponent AI. The design separates **belief**, **search**, **evaluation**, **combat planning**, **personality**, **calibration**, **telemetry** and **orchestration** so tuning one concern does not destabilize the others.

## Architecture

```text
AIController
├── BeliefModel / ParticleFilter
├── MCTS (ISMCTS-style determinization per iteration)
├── Evaluator
├── CombatPlanner
├── RiskManager
├── PersonalityProfile + short-term opponent memory
├── AITelemetryCollector
└── DifficultyConfig

Calibration / tooling
├── 48-scenario strategic corpus
├── Calibration runner
├── AI-vs-AI self-play harness
└── JSON + CSV telemetry
```

### Modules

- `types.ts` — strict contracts for game adapters, particles, difficulty, calibration and telemetry.
- `config.ts` — Easy/Normal/Hard/Expert/Master budgets.
- `personality.ts` — Aggro, Midrange, Control, Tempo and Combo/Value profiles plus smooth adaptation.
- `belief.ts` — particle filter over hidden hand/deck hypotheses with archetype priors and draw-likelihood updates.
- `evaluator.ts` — hybrid high-level heuristic, lethal pressure, board/value/resource/risk evaluation.
- `combat.ts` — lethal, attack ordering and blocking/trade planning.
- `risk.ts` — hold-response, bluff timing, overextension and search-time action bias.
- `mcts.ts` — Selection → Expansion → Simulation → Backpropagation with UCT, determinization and risk priors.
- `controller.ts` — public façade, mulligan, intentional mistakes, adaptation, forced-lethal safety early-out and browser telemetry.
- `telemetry.ts` — structured decision/match metrics and CSV export.
- `calibration.ts` — deterministic 48-scenario strategic corpus.
- `calibration-runner.ts` — runs the corpus across difficulty levels.
- `selfplay.ts` — generic advanced-AI-vs-advanced-AI headless harness.
- `runtime.ts` — browser bridge, public observation diffing, thinking indicator and opt-in debug panel.

## Imperfect information / Belief Model v2

The AI does not need to inspect a privileged opponent hand in order to search. `BeliefModel` maintains weighted hypotheses and `MCTS` requests a fresh determinization for each simulation.

The current model uses:

- the known deck composition as a fair prior;
- an unseen-card pool with remaining copy counts;
- hero/archetype synergy priors;
- strong penalties for particles inconsistent with played/discarded/revealed cards;
- draw-likelihood adjustments as the game progresses;
- effective particle count, top weight and Shannon entropy diagnostics;
- resampling when particle degeneracy becomes too high.

Public observations can be fed explicitly:

```ts
controller.observe({ type: "play", player: 0, cardId: playedCard.id, card: playedCard });
controller.observe({ type: "draw", player: 0, count: 1 });
controller.observe({ type: "discard", player: 0, cardId: discarded.id, card: discarded });
controller.observe({ type: "shuffle", player: 0 });
```

The browser runtime also derives public observations from state deltas between AI decisions. Card identities are passed into the belief model only after they become public; hidden draws are represented by count only.

## Search policy

MCTS uses UCT and imperfect-information determinization. Each iteration samples one hidden-state hypothesis and performs a bounded rollout. Rollouts are hybrid: the configured heuristic probability selects among the strongest evaluated successors while the remainder samples legal actions.

Risk is no longer a separate post-MCTS correction layer. `RiskManager.actionBias()` participates during expansion and heuristic rollouts, so the same search compares:

- developing another permanent vs. avoiding overextension;
- spending a response now vs. holding it;
- passing priority with resources open;
- attacking now vs. protecting value/setup;
- ending a phase with wasted energy.

The evaluator independently contains strong lethal, danger, sweep-risk and resource terms. `findRobustForcedLethal()` remains only as a safety early-out on Hard/Expert/Master.

The final root action is selected by **visit count**, not raw value, which is more stable under imperfect information.

## Difficulties

| Level | Search | Particles | Mistakes | Intent |
| --- | --- | ---: | ---: | --- |
| Easy | 1-ply heuristic | 6 | 28% | believable beginner |
| Normal | light MCTS | 18 | 10% | competent casual |
| Hard | medium MCTS | 42 | 3.5% | strong player |
| Expert | strong MCTS | 96 | 1% | tournament-like |
| Master | maximum browser budget | 160 | 0% | adaptive expert |

Iteration count, thinking time, rollout depth, UCT constant, noise and yield cadence are centralized in `config.ts`.

## Personalities and human adaptation

- **Aggro** — maximizes lethal pressure and tempo; accepts bad-value trades to close games.
- **Midrange** — balanced board/value plan with efficient trades.
- **Control** — values life, removal, responses, hand advantage and anti-overextension.
- **Tempo** — maximizes energy efficiency, initiative and short tactical swings.
- **ComboValue** — protects setup pieces, hand value and synergy until an explosive turn.

Adaptation is gradual instead of switching personalities abruptly. Normal/Hard/Expert/Master blend toward defensive, aggressive, tempo or value behavior with increasing strength according to:

- current life totals;
- card advantage;
- lethal proximity;
- the opponent's last few public plays.

Short-term opponent memory tracks approximate aggression, patience and interaction over the last few observations. Expert/Master also gain more believable bluff timing because MCTS can assign value to passing with a legal response still in hand.

## Calibration corpus

The committed corpus contains **48 deterministic scenarios**, six in each category:

- lethal;
- favorable trade;
- overextension;
- hold response;
- empty-board development;
- low-life stabilization;
- energy/reserve efficiency;
- hand-cap management.

Each scenario defines a set of acceptable actions rather than requiring one arbitrary exact move.

Run all five difficulties:

```bash
npm run ai:calibrate
```

Filter difficulties or scenarios by forwarding CLI arguments to the compiled runner:

```bash
npm run ai:runtime:build
node .ai-runtime/scripts/ai-calibration.js --difficulty=Hard,Expert,Master --scenarios=lethal-1,overextension-2
```

CI runs a fast eight-category Easy smoke suite through `npm run ai:calibrate:smoke`. Full calibration is intentionally not part of every build because Expert/Master are time-budgeted searches.

Generated reports are written under `reports/ai/` and ignored by git. Output includes JSON plus CSV with:

- correct/acceptable action rate;
- accuracy by difficulty and category;
- evaluation score;
- lethal margin and overkill;
- belief entropy;
- iterations and iterations/second;
- unused energy/reserve;
- response cards held.

## Self-play

The advanced self-play harness uses `AIController` on both sides and an authoritative `EngineAdapter`; it does not duplicate card rules.

Example:

```bash
npm run ai:selfplay -- --games=50 --difficulty0=Hard --difficulty1=Expert --hero0=goblin --hero1=tifon --seed=20260818
```

The CLI writes structured JSON/CSV telemetry so difficulty and hero/profile matchups can be compared over batches. For large experiments, keep the RNG seed and scenario/deck generation settings in the report so regressions are reproducible.

## Browser integration

Create one controller for the AI player and reuse it for the match:

```ts
const aiControllerRef = useRef<AIController>();
if (!aiControllerRef.current) aiControllerRef.current = new AIController(difficulty);
aiControllerRef.current.setDifficulty(difficulty);

const result = await aiControllerRef.current.chooseAction(game, 1);
if (result.action) await runRulesCommand(result.action, 1);
```

The controller emits `hemsfell:ai-thinking` while a search is running. The runtime shows the normal “IA pensando…” indicator automatically.

### Debug telemetry UI

Enable the opt-in AI debug panel with either:

```js
localStorage.setItem("hemsfell-ai-debug", "1")
```

or `?aiDebug=1` in the URL. The panel shows:

- belief entropy and effective particle count;
- current evaluation and lethal margin;
- real iterations/second and search time;
- short-term opponent-memory values.

This panel is diagnostic only and is not rendered for normal players.

## Weight calibration discipline

Do not tune weights by intuition alone. Recommended promotion rule:

1. Freeze a baseline commit and RNG seeds.
2. Run the 48-scenario corpus on all relevant difficulties.
3. Run a self-play batch for affected personalities/matchups.
4. Change one weight family at a time: lethal, board, tempo, value, risk or interaction.
5. Accept the change only if the target category improves without a material regression in unrelated categories.
6. Compare overkill, unused resources and responses-held metrics, not only win rate.
7. Record the before/after report with the tuning change.

A good tuning change should be explainable as data, for example: “Expert hold-response accuracy improved from 78% to 88%, with no lethal regression and 12% less unused end-turn energy.”

## Performance rules

- Search uses bounded time **and** bounded iterations.
- Rollouts have a hard depth cap.
- The main loop yields periodically to the browser.
- Only determinized search states are cloned; evaluation is read-only.
- Root choice uses visit count to reduce noisy hidden-state oscillation.
- Particle count scales by difficulty.
- Search telemetry records real iterations/second on target hardware.
- Do not add a Web Worker merely because Master has a large nominal budget; first measure frame responsiveness and iterations/second on representative devices.

If Master begins causing visible frame stalls on mid-range hardware, the next performance step is moving the unchanged MCTS contract into a Web Worker and serializing only minimal game-state/action data. Card art and other UI payloads must remain outside worker messages.

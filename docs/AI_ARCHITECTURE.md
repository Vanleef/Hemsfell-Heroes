# Hemsfell Heroes — Competitive AI Architecture

This branch introduces a competitive, imperfect-information AI stack while keeping the current rules engine authoritative. The AI never owns card resolution: it proposes an action, and `executeCommand` remains the final legality gate.

## Architecture

```text
app/ai/
  types.ts              strict public contracts for state/action/search
  config.ts             Easy → Master search budgets and error rates
  personality.ts        Aggro/Midrange/Control/Tempo/Combo-Value profiles
  belief-model.ts       determinization + particle-filter belief state
  evaluator.ts          hybrid high-level evaluation and card valuation
  tactics.ts            forced lethal, mulligan and combat/block planning
  mcts.ts               async open-loop Information-Set MCTS (UCT)
  controller.ts         AIController orchestration and humanized mistakes
  hemsfell-adapter.ts   bridge to Hemsfell's authoritative rules engine
  ai-ui-bridge.tsx      Expert/Master controls + non-blocking thinking UX
  index.ts              public exports

app/rules-engine/
  ai-legacy.mjs                 frozen compatibility implementation
  ai.mjs                        competitive compatibility facade
  competitive-ai-runtime.mjs    tiny time-boxed browser search bridge
  priority-legacy.mjs           frozen priority implementation
  priority.mjs                  competitive response facade
```

The TypeScript stack is the source of truth for the modern AI. `competitive-ai-runtime.mjs` is intentionally smaller: the current React match page expects a synchronous `buildAIActionCandidates()` API. The bridge therefore performs a very short root IS-MCTS/bandit search (0–18 ms depending on difficulty) and returns candidates in competitive order without blocking a browser frame for a long search. New integrations should call `AIController.chooseAction()` instead; it is asynchronous, time-sliced and abortable.

## Difficulty budgets

| Level | Main behavior | IS-MCTS | Particles | Rollout depth | Deliberate error |
|---|---|---:|---:|---:|---:|
| Easy | heuristic + human mistakes | off | 6 | 2 | 28% |
| Normal | light search | 72 iter / 42 ms | 16 | 5 | 10% |
| Hard | medium search | 220 iter / 82 ms | 32 | 7 | 3.5% |
| Expert | strong search | 480 iter / 145 ms | 48 | 9 | 1.2% |
| Master | strongest browser budget + adaptive style | 900 iter / 245 ms | 72 | 11 | 0.3% |

`config.ts` is intentionally the only place that owns these tuning values.

## Imperfect information

`ParticleFilter` treats the opponent's hidden hand and remaining deck as one unknown multiset. It uses the known deck composition and public zone sizes, but **does not preserve the real hidden partition**. Each particle shuffles a legal hypothesis into hidden hand/deck slots while keeping publicly revealed cards consistent. Public observations update or down-weight particles, and low effective sample size triggers systematic resampling.

Supported observations include play, draw, discard, reveal, shuffle, mulligan and public state snapshots. Every MCTS iteration samples a new determinization, so lines are evaluated against multiple plausible opponent holdings instead of cheating with the actual hidden hand.

## IS-MCTS

`MCTS` is an open-loop information-set tree. Nodes store action statistics, not private concrete states. For each iteration:

1. sample a determinization from the particle filter;
2. Selection with UCT;
3. Expansion of one legal unseen action;
4. hybrid rollout (70% heuristic action, 30% random action by default);
5. evaluate the resulting state from the AI owner's perspective;
6. backpropagate the reward through shared information-set action nodes.

At opponent nodes exploitation is inverted, making the search adversarial. The final action is the most visited root action, which is more stable than choosing the noisiest maximum mean.

The async search yields to the browser every few iterations and obeys both iteration and wall-clock budgets. `AbortSignal` can cancel a search when the match state changes.

## Hybrid evaluator

The evaluator produces normalized high-level features and then applies personality-specific weights:

- life differential and immediate lethal pressure;
- board quality (effective attack/health + relevant keywords);
- tempo and initiative;
- hand/value differential;
- board control and pressure;
- hero/archetype synergy;
- overextension risk;
- value of accelerated responses and Reserve;
- resource efficiency;
- risk/safety margin.

Terminal wins/losses always override heuristics. Heuristic noise is difficulty controlled, not uncontrolled `Math.random()` sprinkled across rules.

## Personalities

Five profiles live in `personality.ts`:

- **Aggro** — maximizes damage/initiative, accepts risk, trades less and spends responses freely.
- **Midrange** — balanced pressure, value and efficient trades.
- **Control** — values survival, answers, hand size and trades; strongly penalizes overextension.
- **Tempo** — values initiative, resource efficiency and tactical responses.
- **Combo / Value** — protects setup, hand and synergy until an explosive line appears.

Heroes have default profiles. Master may switch profile based on board, life, lethal pressure and available response mana; this makes the opponent feel adaptive without reading hidden player information.

## Lethal, mulligan and combat

`LethalAnalyzer` runs a bounded adversarial proof search before expensive MCTS on non-Easy levels. AI-owned nodes are existential; opponent response nodes are universal, so a line is marked as *forced lethal* only if every legal defensive branch still loses inside the search horizon.

`MulliganPlanner` scores opening cards by curve, archetype synergy, matchup pressure, duplicate quality, response value and expensive-brick risk. It exposes both exact keep/replace IDs and a full-mulligan recommendation.

`CombatPlanner` evaluates blocks by damage prevented, value lost, value killed and the personality's trade preference. The authoritative engine still decides legality.

## Hemsfell integration

Recommended new code path:

```ts
import { AIController, HemsfellGameAdapter } from "@/app/ai";

const adapter = new HemsfellGameAdapter("Expert");
const ai = new AIController(1, adapter, "Expert", { personality: "control" });

const result = await ai.chooseAction(gameState, {
  signal: abortController.signal,
  onProgress: (label, progress) => setAiThinking({ label, progress }),
});

if (result.action) {
  const next = adapter.apply(gameState, result.action);
  if (next.legal) setGame(next.state);
}
```

The current match page is supported without a risky rewrite: `rules-engine/ai.mjs` preserves every legacy export used by `page.tsx` but ranks the generated candidates with the competitive runtime. Expert/Master selection is provided by `AIUiBridge`. The existing authoritative engine remains the legality check.

For the next integration step, move the full `AIController` call to a Web Worker. Transfer only a serializable public snapshot plus the AI player's private hand, and post back the chosen action and diagnostics. Keep `executeCommand` on the main/game-authority side. This yields stronger search budgets without UI stalls.

## Debugging

Every `AIController.chooseAction()` result includes diagnostics:

- iteration count and wall-clock time;
- number of determinizations sampled;
- every root action's visits and mean value;
- whether selection came from heuristic, MCTS, forced lethal or an intentional humanized mistake.

Recommended debug tooling:

1. deterministic seeded random function for reproducible matches;
2. log top 5 root actions, visits, mean values and evaluator feature breakdown;
3. record belief effective sample size and revealed-card consistency;
4. run large headless self-play batches by hero matchup and difficulty;
5. keep rules-engine failures as hard invalid actions rather than silently rewarding them.

## Weight calibration

Do not tune one card at a time. Calibrate on match populations:

1. establish a deterministic baseline with Midrange weights;
2. run several thousand mirrored self-play games so both seats/decks swap sides;
3. inspect win rate, average game length, missed forced lethals, floating energy, bad trades and response hoarding;
4. tune one feature family at a time by ±5–10%;
5. use personality deltas rather than duplicating hero-specific rules;
6. reserve card/hero exceptions for actual strategic identities, not symptoms of a weak evaluator;
7. keep Master deterministic enough for regression tests and add tiny noise only for tie-breaking.

A practical target is that each higher difficulty defeats the level below over a large mirrored sample while remaining within the same rules and information available to a human player.

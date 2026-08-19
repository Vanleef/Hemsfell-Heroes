# Hemsfell Heroes — Online Priority and Turn Flow

Status: design specification only. This document does **not** change gameplay code yet.

The official `Manoel de Regras` is the source of truth. MTG and Legends of Runeterra are references only for clarity, priority handoff and stack UX; no rule from either game overrides Hemsfell Heroes.

## Manual invariants

The redesign must preserve these rules:

- A turn has Maintenance, Main, Combat and Finalization.
- At the start of Maintenance, the active player untaps their cards, then chooses between `+1 maximum Energy + draw 1` or `draw 2`; on the first turn the maximum-Energy choice is mandatory. Energy is then generated up to the player's maximum. Damaged creatures return to their original Vitality during Maintenance.
- A player loses if their life reaches zero, if their deck is empty at the beginning of their Maintenance, or through a special loss condition.
- Main allows the active player to play any number of cards while paying their costs.
- In Combat, the attacker chooses which creatures attack; the defender chooses blockers or allows direct damage. Combat is resolved from left to right and creature-vs-creature damage is simultaneous unless a card says otherwise.
- In Finalization, remaining main Energy is transferred to Energy Reserve, up to the Reserve limit, end-of-turn effects resolve, then the turn passes.
- Maximum main Energy is 10. Energy Reserve stores at most 3 and can be spent only on spells and card effects.
- `Acelerado` spells may be played in response intervals, including during the opponent's turn.
- Creatures cannot attack on their first turn in play unless a rule such as `Investida` allows it, but they may defend.
- `Vire` effects on newly entered Artifacts and Enchantments remain unavailable on their first turn in play.
- Images are treated as the constant type they copy/represent while in play.
- Static/continuous effects, zones, keywords and all card-specific rules remain unchanged by this timing redesign.

The manual does not formally define the internal mechanics of an "intervalo de resposta", a stack, pass counting, or simultaneous-trigger ordering. Those pieces are therefore formalized below only to make the existing game rules deterministic online; they must not create new card functionality.

## 1. Overview of the new priority model

The Online mode uses two related concepts:

1. **Action Priority**: the active player owns the initiative when the stack is empty and the current step allows a normal action. In Main this is where non-Acelerado cards and other own-turn actions are used.
2. **Response Priority**: a response window in which the priority owner may play an `Acelerado`, use an ability that the existing card rule explicitly allows in that timing, or pass.

The system is intentionally hybrid:

- MTG-like: explicit priority owner, LIFO stack, two consecutive passes, top item resolves one at a time, active player regains initiative after a resolution.
- LoR-like: when a player commits an action to the stack, priority is handed to the opponent immediately instead of requiring the acting player to click an extra pass just to offer a response.

There is no separate Burst/Fast/Slow rules vocabulary in Hemsfell. `Acelerado` is the only generic response-speed spell keyword. Non-Acelerado cards remain normal own-turn actions unless their own explicit card rule says otherwise.

### Core pass algorithm

- A response action resets `consecutivePasses` to `0` and hands priority to the other player.
- Passing increments `consecutivePasses` and hands priority to the other player.
- If both players pass consecutively while the stack contains an item, **only the top stack item resolves**.
- After that resolution:
  - if the stack still contains items, a fresh response cycle starts with the active player receiving priority;
  - if the stack is empty, control returns to the appropriate next game checkpoint, normally Action Priority for the active player.
- If both players pass consecutively with an empty stack in a phase-transition window, the phase/step advances.
- Any action added to the stack breaks the consecutive-pass sequence.

This removes the need for the current special case that forbids an original actor from responding when priority returns after one pass. A legal response is allowed; the new action simply resets the pass count and hands priority over again.

## 2. Complete turn flow

### A. Maintenance

Maintenance is split into deterministic turn-based operations and one response checkpoint.

1. **Start-of-turn checks**
   - Verify loss by empty deck at the beginning of Maintenance.
   - Apply any already-existing start-of-turn state bookkeeping.
   - No generic priority window opens in the middle of these mandatory checks.

2. **Refresh**
   - Untap cards according to the current rules and status effects.
   - Restore creature damage/Vitality according to the manual and existing status rules.
   - Apply existing rules such as Imobilizado that modify untapping.

3. **Maintenance choice**
   - First turn: forced `+1 max Energy + draw 1`.
   - Later turns: choose either:
     - `+1 max Energy + draw 1`; or
     - `draw 2`.
   - Maximum Energy remains capped at 10.

4. **Generate Energy**
   - Generate main Energy up to the current maximum after the choice, exactly as the manual specifies.

5. **Maintenance triggers**
   - Existing Maintenance/start-turn triggered abilities are enqueued according to the current deterministic engine ordering.
   - Continuous effects never enter the stack.

6. **Maintenance response checkpoint**
   - If stack items/triggers exist, Response Priority opens.
   - Otherwise, an assisted client may skip the empty checkpoint automatically.
   - `Acelerado` and explicitly response-legal abilities may be used.
   - When the stack is empty and both players are done, enter Main.

### B. Main

1. Active player receives **Action Priority** with an empty stack.
2. The active player may:
   - play a normal legal card;
   - play an `Acelerado` as a normal own-turn spell;
   - activate an ability legal at that moment under its existing rule;
   - evolve the Hero if current Hero evolution rules allow it;
   - request to end Main.
3. A card or activated ability that uses the stack is committed with costs/targets/choices that must be paid/chosen at declaration time according to current card rules.
4. After the active player commits an interactable action, Response Priority is handed to the opponent.
5. Players alternate legal responses/passes until the stack resolves.
6. When the stack is empty, Action Priority returns to the active player.
7. To end Main, the active player chooses **End Main**. This is the active player's first pass on an empty stack:
   - opponent receives a final response opportunity;
   - if opponent also passes, Main ends and Combat begins;
   - if opponent responds, resolve the response chain, return to Main Action Priority, and require the active player to request End Main again.

This prevents an opponent response from silently occurring "after" the game has already moved to Combat.

### C. Combat

Combat uses explicit declaration checkpoints and no hidden timing windows.

#### C1. Combat start

- Open one `COMBAT_START` response checkpoint before attacker declaration.
- Active player receives priority first.
- Only response-speed actions are legal here; normal Main-speed cards are not.
- Two passes with an empty stack advance to attacker declaration.

#### C2. Declare attackers

- Priority is suspended while the active player selects all attackers for the combat group.
- Attack legality uses all existing rules: first-turn attack restriction, Investida, Indomável, Atordoado, Vire/exhaustion, attack limits, Tessália restrictions and card-specific permissions.
- The attacker commits the complete attack group.
- No damage occurs yet.

#### C3. After attackers response window

- Because the active player just committed the attack declaration, Response Priority starts with the defending player.
- Both players may use `Acelerado` or explicitly response-legal abilities.
- When the stack is empty and both pass, blocker declaration begins.

#### C4. Declare blockers / direct damage choices

- Priority is suspended while the defender assigns legal blockers to attackers or chooses to take direct damage where allowed.
- Existing rules such as Voar, Furtivo, Defensor X, Atordoado and combat restrictions determine legal assignments.
- All assignments are committed as one combat declaration state.

#### C5. Post-block / pre-damage response window

This is the canonical **After Blockers / Before Combat Resolution** window. It is one window, not two redundant click cycles.

- Because the defender just committed blockers, priority starts with the active player.
- Both players may use response-speed actions.
- Block assignments remain locked unless a card effect explicitly changes combat state.
- When both pass with an empty stack, combat damage resolution begins.

#### C6. Resolve combat left to right

- Resolve attacker lanes from left to right, preserving the manual.
- Within each creature-vs-creature confrontation, damage is simultaneous unless Veloz or another explicit card rule changes timing.
- Apply Robusto, Atropelar, Roubo de Vida, Toque da Morte, Indestrutível and all other existing combat rules exactly as they currently work.
- Direct-damage lanes resolve at their left-to-right position.
- Do **not** create an arbitrary generic response window between every lane.
- If resolving a lane creates a mandatory triggered effect that the current rules engine treats as interactable, enqueue it immediately and pause continuation only for that trigger stack. After it resolves, continue with the next lane.
- Simultaneous trigger ordering should remain the current deterministic engine ordering until the official manual defines another ordering; this redesign must not invent APNAP trigger ordering as a new Hemsfell rule.

#### C7. Combat end

- After all combat lanes and their mandatory triggers resolve, open one `COMBAT_END` response checkpoint.
- Two passes with empty stack move to Finalization.

### D. Finalization

The order follows the manual literally.

1. **Transfer Energy to Reserve**
   - Move remaining main Energy into Reserve up to the Reserve cap of 3.
   - Excess beyond the cap is lost.
   - Main Energy becomes 0.

2. **Queue end-of-turn effects**
   - Existing end-of-turn triggers are placed into the engine's deterministic stack/order.

3. **Finalization response window**
   - Active player receives priority first after end-turn triggers have been queued.
   - `Acelerado` and explicitly response-legal abilities may be used.
   - Because main Energy has already been transferred, available response resources follow Reserve rules.

4. **Cleanup**
   - After the stack is empty and both players pass, perform existing cleanup rules that occur at turn end (temporary effects, counters/status expirations, hand-limit workflow if applicable, etc.) without changing their current card semantics.

5. **Pass turn**
   - Active player changes.
   - New player's turn starts in Maintenance.

## 3. Canonical response windows

| Window | Opens when | First priority | Legal generic responses | Closes when |
|---|---|---|---|---|
| `MAINTENANCE_TRIGGERS` | Mandatory Maintenance operations finish and interactable triggers exist | Active player | Acelerado + explicitly response-legal ability | Stack empty and response cycle ends |
| `MAIN_ACTION_RESPONSE` | Active player commits a card/ability that uses stack | Opponent | Acelerado + explicitly response-legal ability | Root action and responses resolve |
| `MAIN_END` | Active player requests End Main with empty stack | Opponent | Acelerado + explicitly response-legal ability | Opponent passes with no response, or response chain resolves and Main resumes |
| `COMBAT_START` | Enter Combat before attackers | Active player | Acelerado + explicitly response-legal ability | Two empty-stack passes |
| `AFTER_ATTACKERS` | Attack group committed | Defender | Acelerado + explicitly response-legal ability | Stack empty and both pass |
| `AFTER_BLOCKERS` | Block/direct-damage assignments committed | Active player | Acelerado + explicitly response-legal ability | Stack empty and both pass; then damage |
| `COMBAT_TRIGGER` | A combat lane produces an interactable mandatory trigger | Active player after trigger queue | Acelerado + explicitly response-legal ability | Trigger stack resolves |
| `COMBAT_END` | All combat lanes finish | Active player | Acelerado + explicitly response-legal ability | Two empty-stack passes |
| `FINALIZATION` | Reserve transfer finishes and end-turn triggers are queued | Active player | Acelerado + explicitly response-legal ability | Stack empty and both pass; then cleanup/turn swap |
| `ACTIVATED_ABILITY_RESPONSE` | An interactable activated ability is committed | Opponent of ability controller | Acelerado + explicitly response-legal ability | Ability and response chain resolve |

`After Blockers` and `Before Combat Resolution` intentionally refer to the same canonical window. Splitting them into two identical windows adds clicks without adding meaningful information.

## 4. Detailed stack and priority rules

### What goes on the stack

- Played spells before they resolve.
- Played constants before they enter play, if the action is response-enabled by the engine.
- Activated abilities that are interactable.
- Triggered abilities that the existing engine treats as interactable.
- Combat declaration may be represented by a root frame/continuation token for implementation, but blocker assignment and damage are combat-state checkpoints rather than ordinary spells.

### What does not go on the stack

- Continuous/static effects.
- Mandatory turn-based Maintenance operations themselves.
- Main Energy generation.
- Finalization Energy-to-Reserve transfer.
- State-based checks such as a unit being destroyed because its effective Vitality reached zero.
- Pure presentation animations.

### Costs and targets

- Costs are paid when the action is committed, not when it resolves.
- Targets/required selections are chosen when the action is committed, preserving current card-specific validation.
- A later response does not refund the original cost unless a specific Hemsfell card explicitly says it does.
- On resolution, targets are revalidated according to current engine rules. Do not introduce a new universal fizzle/partial-resolution rule where the existing card engine already defines one.

### Two-pass resolution

Example stack, top first:

1. Player B — Acelerado B2
2. Player A — Acelerado A1
3. Player A — original spell

If both pass, only B2 resolves. Active player then receives priority again while A1 and the original spell remain pending. Another two-pass cycle resolves A1, and so on.

### Pass terminology

Online UI must never use one ambiguous button for three concepts.

- **Pass Priority**: decline to respond right now. Does not automatically end the phase.
- **End Phase**: active player proposes leaving Main/Combat checkpoint; opponent receives the defined final response opportunity.
- **End Turn**: available only during Finalization when the turn can legally finish.

Assisted-control mode may auto-pass when the player has no legal response. Full-control mode never auto-passes a legal response window.

## 5. Combat implementation contract

Combat should be modeled as a state machine rather than a collection of unrelated modals:

`COMBAT_START_PRIORITY`
→ `DECLARE_ATTACKERS`
→ `AFTER_ATTACKERS_PRIORITY`
→ `DECLARE_BLOCKERS`
→ `AFTER_BLOCKERS_PRIORITY`
→ `RESOLVE_LANE_0 ... RESOLVE_LANE_4`
→ optional `COMBAT_TRIGGER_PRIORITY`
→ `COMBAT_END_PRIORITY`
→ `FINALIZATION`

Important invariants:

- Attackers are declared as a group before blockers.
- Defender sees the committed attack group before assigning blockers.
- Blockers are declared as a group.
- No combat damage is applied until the post-block response window closes.
- Combat order is deterministic left-to-right.
- Synchronous damage remains synchronous within a confrontation unless a card rule overrides it.
- `Defensor X` capacity, Furtivo, Voar and all existing legality rules are validated server-side at declaration and again immediately before resolution if a response changed the state.
- If a response makes an attacker/blocker illegal or removes it from play, the engine reconciles the already-declared combat using current card semantics rather than asking the client to invent a result.

## 6. Acelerado and Energy Reserve

### Acelerado

- `Acelerado` can be cast in every canonical response window for which the card's other conditions are legal.
- Acelerado uses the same LIFO stack as other interactable effects.
- Acelerado is **not** a Burst effect: it can itself be responded to.
- A normal non-Acelerado spell is not automatically legal during an opponent response window.

### Reserve

Official rule:

- Capacity: 3.
- Filled from Energy left at the end of the player's turn.
- Spendable only on spells and card effects.

Implementation convention to preserve existing Hemsfell behavior unless the manual is later amended:

- On the controller's own turn, a spell/effect may use the resource pools currently allowed by that action; existing spend-order rules remain unchanged.
- During the opponent's turn, main Energy should not be available because it was transferred/cleared during Finalization; legal response costs therefore come from Reserve (and non-Energy costs such as life/markers when the card explicitly uses them).
- Creatures and other non-effect/non-spell costs must not consume Reserve merely because a response window exists.

## 7. High-level code/GameState changes

### Current implementation issues to replace

The current system primarily models priority with `pendingResponse { actor, responder, passes }` plus `priorityStack`. It also contains a special rule that prevents the original actor from responding after priority returns with one pass. The room server separately locks the actor while `pendingResponse` exists, resets response deadlines, and on a turn timeout directly flips `active`, resets the phase to Maintenance and clears response/combat state.

That representation works for a single response exchange but is fragile for a true multi-step online priority system.

### Proposed authoritative state

```ts
type PriorityMode = "action" | "response" | "none";
type PriorityWindowKind =
  | "maintenance-triggers"
  | "main-action-response"
  | "main-end"
  | "combat-start"
  | "after-attackers"
  | "after-blockers"
  | "combat-trigger"
  | "combat-end"
  | "finalization"
  | "activated-ability-response";

type StackFrame = {
  id: string;
  kind: "card" | "ability" | "trigger" | "combat-continuation";
  controller: 0 | 1;
  command: Record<string, unknown>;
  sourceId?: string;
  label?: string;
};

type PriorityState = {
  mode: PriorityMode;
  owner: 0 | 1 | null;
  window: PriorityWindowKind | null;
  consecutivePasses: 0 | 1;
  stack: StackFrame[];
  resumePoint?: string | null;
  deadline?: number | null;
};
```

Recommended additional state:

- `turnStep` or an expanded phase/substep enum.
- `combat.attackers[]` containing ordered declarations.
- `combat.blocks[]` containing attacker→defender assignments/direct-damage choice.
- `combat.resolutionIndex` for left-to-right deterministic resume.
- `revision`/sequence remains server-owned.
- `turnDeadline` should be treated as a real turn clock rather than reset after every valid command.
- `priority.deadline` is independent from the turn clock.

### Server authority

The online room server must be the only authority for:

- priority owner;
- legal transition between substeps;
- pass count;
- stack push/pop;
- combat declaration/assignment validity;
- timeout auto-pass;
- phase advancement;
- turn swap.

Clients should send commands, never a replacement `GameState` for priority-sensitive transitions.

### Timeout behavior

- Response timeout => server issues `passPriority` for the current priority owner.
- Turn timeout must **not** directly flip active player and erase stack/combat state.
- Instead, timeout requests the safest legal progression through the state machine: auto-pass current action priority, complete required combat declarations conservatively, close legal response windows, run Finalization, then swap turns.
- The active player's long turn clock should not be consumed while the opponent is holding response priority; either pause it or use per-player clocks. Otherwise an opponent could spend the active player's clock.

### Events

Emit structured events at minimum:

- `priority.opened`
- `priority.changed`
- `priority.passed`
- `priority.autoPassed`
- `stack.pushed`
- `stack.resolving`
- `stack.resolved`
- `stack.fizzled` (only where current rules actually support this result)
- `phase.advanceRequested`
- `phase.changed`
- `combat.attackersDeclared`
- `combat.blockersDeclared`
- `combat.laneResolving`
- `combat.completed`
- `turn.ended`

Logs/UI should derive human-readable messages from these events rather than infer timing from local modals.

### AI behavior

- AI acts only when `priority.owner === aiOwner` or when it owns the active Action Priority.
- If it has no legal response, auto-pass without launching MCTS.
- Response searches use a strict small budget and are keyed by immutable priority-window/stack signatures to prevent repeated evaluation of the same window.
- AI must evaluate the stack and continuation state, not only the visible root action.
- A response action resets pass count exactly like a human action.
- The same authoritative legality generator is used for Human, AI and Online server.

## 8. Validation checklist

### Manual fidelity

- [ ] Maintenance choice remains exactly `+1 max Energy + draw 1` vs `draw 2`.
- [ ] First turn forces the Energy-increase option.
- [ ] Energy generation happens after that choice.
- [ ] Creature damage/Vitality restoration remains in Maintenance.
- [ ] Empty-deck loss check occurs at the beginning of Maintenance.
- [ ] Main still allows any number of legal card plays, limited by resources/rules.
- [ ] Attacker chooses attackers; defender chooses blockers/direct damage.
- [ ] Combat resolves left-to-right.
- [ ] Creature combat damage is simultaneous unless an explicit card rule changes it.
- [ ] Finalization transfers remaining Energy to Reserve before end-turn effects.
- [ ] Reserve remains capped at 3 and is restricted to spells/card effects.
- [ ] Acelerado is legal in defined response windows on either player's turn.
- [ ] Creature first-turn attack restriction, Investida and defending behavior are unchanged.
- [ ] Hero leveling costs/requirements and once-per-turn leveling remain unchanged.
- [ ] Hero card itself remains untargetable by card effects; effects that explicitly affect player life continue using player/life targeting semantics.
- [ ] Artifact/Enchant `Vire` entry restriction remains unchanged.
- [ ] Images retain their represented constant type.
- [ ] Existing zones, Sacrificar, Banir, Destruir and all keywords remain unchanged.

### Priority/stack correctness

- [ ] Exactly one authoritative `priority.owner` exists at a time.
- [ ] Acting on priority hands priority to the other player and resets pass count.
- [ ] One pass hands priority over; two consecutive passes resolve only the top stack item.
- [ ] After top resolution, active player receives the next priority checkpoint.
- [ ] A response can be responded to.
- [ ] The original actor may legally respond later if priority comes back and the action is legal.
- [ ] Empty-stack phase advancement only occurs after the required final pass cycle.
- [ ] No client can advance phase, assign blockers or resolve damage out of order.
- [ ] Static effects never create phantom stack frames.

### Combat correctness

- [ ] Attacker declaration is committed before defender assignment.
- [ ] After-attackers response window occurs before blockers.
- [ ] Post-block/pre-damage response window occurs after blocker commit and before damage.
- [ ] No arbitrary response gap appears in the middle of synchronous lane damage.
- [ ] Mandatory combat triggers pause/resume the deterministic left-to-right continuation safely.
- [ ] Removing/changing a combatant in response cannot lock the match.

### Online reliability

- [ ] Every priority-sensitive command validates room revision.
- [ ] Duplicate/retried commands are idempotent or rejected without state corruption.
- [ ] Response timeout always auto-passes instead of inventing an action.
- [ ] Turn timeout progresses through the legal state machine instead of clearing stack/combat.
- [ ] Reconnect restores exact priority owner, stack, pass count and combat substep.
- [ ] No player can consume the opponent's turn clock by intentionally holding response priority.
- [ ] Match log records stack/priority transitions in understandable order.

## Migration principle

Implement this incrementally behind an Online-only flow flag first. Keep the existing rules engine/card semantics shared. The migration should replace only **when** an already-legal action can be attempted and **how** Online serializes/resolves response timing; it must not redefine what cards, Heroes, combat keywords or effects do.

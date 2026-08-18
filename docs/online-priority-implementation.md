# Online priority implementation status

This file tracks the staged migration of Online mode to the timing model specified in `docs/online-priority-flow-rework.md`.

## Phase 1 — implemented

- Canonical `priority` metadata (`model`, `mode`, `owner`, `window`, consecutive passes, deadline and stack depth).
- Canonical read-only `stack` projection for UI/debug/telemetry while legacy `pendingAction` / `pendingResponse` / `priorityStack` remain compatibility fields.
- Server-only Online command kernel in `online-priority-engine.mjs`.
- Only the current `pendingResponse.responder` may answer or pass.
- A legal response after one pass is allowed in `online-v2`; adding it resets the pass sequence.
- Bot/Offline deliberately retain the previous actor-after-one-pass guard until those modes are intentionally migrated, preserving the anti-loop protection for AI priority evaluation.
- Two consecutive passes resolve one stack item, not the entire stack.
- After resolving a nested stack item, a fresh response cycle starts with the active player.
- Ending Main or legacy Combat is a response checkpoint in Online mode instead of an immediate phase jump.
- Online room commands and response timeouts route through the same priority kernel.
- Turn timeout no longer teleports across a live stack, combat exchange or pending decision.
- `activateHero` is part of the authoritative Online command allow-list.

## Phase 2 — server combat kernel implemented, client migration pending

- `declareAttackers` commits an ordered attacker group instead of resolving one attacker at a time.
- Attack legality is preflighted through the existing authoritative `declareAttack` rule path; Tessália, statuses, attack limits and card-specific permissions therefore remain shared with the current engine.
- Omitted `Indomável` attacks are rejected through the engine's own combat→Finalization legality check.
- `after-attackers` is an explicit response checkpoint and the defender owns the following blocker declaration step.
- `declareBlockers` freezes blocker assignments for the declared attack instances.
- `Defensor X` capacity is enforced across simultaneous assignments, while flying/Furtivo/combat restrictions are preflighted through the authoritative attack resolver.
- `after-blockers` is the single generic pre-damage response checkpoint.
- Combat lanes resolve in declared left-to-right order through the existing synchronous damage resolver; Veloz, Atropelar, Robusto, Roubo de Vida, Toque da Morte and card triggers remain engine-owned.
- A real pending decision pauses lane resolution and `resolveDecision` resumes at the stored `resolutionIndex`.
- `combat-end` is an explicit response checkpoint.
- The `combat-start` checkpoint/state exists in the combat module but is not yet activated by the current client path; it will be enabled together with the grouped-combat UI so the existing Online screen is not left in an unrenderable declaration state.

## Phase 3 — Finalization ordering and response-clock separation implemented

- Online Combat→Finalization banks remaining main Energy before end-turn processing, respecting Reserve max 3 and `noReserveStorageThisTurn`.
- Energy is zeroed before the Finalization response checkpoint, so response spending observes the resources that actually exist after banking.
- Existing end-turn rule processing still comes from the shared deterministic engine.
- Finalization exposes an explicit response checkpoint before cleanup and turn handoff.
- After two passes, the shared engine performs hand-limit handling, cleanup and transition to the opponent's Maintenance.
- If end-turn processing creates a pending decision, Finalization waits for that decision and opens its response checkpoint only after the decision chain is complete.
- The active player's action clock is paused whenever a response window opens and resumes with the exact stored remainder when the stack returns to action priority.
- Every priority handoff receives a fresh response deadline without refilling the action clock.
- Ordinary actions no longer reset the turn timer; a newly active player receives a fresh turn clock.

## Compatibility fields retained during migration

- `pendingAction`
- `pendingResponse`
- `priorityStack`
- `combatAction`

They remain compatibility inputs for the existing UI while the server also exposes canonical `priority`, `stack`, `onlineCombat` and `onlineFinalization` state.

## Remaining client work

- Migrate the Online battlefield UI from `declareAttack`/single-lane combat to `declareAttackers` + `declareBlockers`.
- Enable the `combat-start` response checkpoint once the grouped declaration UI is active.
- Mirror canonical `priority.owner`, canonical stack controllers and grouped combat ownership for the guest-side local orientation.
- Render the current priority owner/window and readable stack contents directly in the Online UI.
- Give the defender's grouped blocker-declaration step its own visible interaction deadline in the client.
- Add browser-level multiplayer tests for reconnection during each checkpoint and stale-revision retries during nested response chains.

No Offline/Bot game flow is routed through the new Online command kernel; only shared deterministic card/rule resolution remains common underneath it.

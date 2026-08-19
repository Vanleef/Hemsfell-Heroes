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

## Phase 2 — grouped combat server and staged client runtime implemented

- After Main has closed through priority, entering Combat opens an explicit `combat-start` response checkpoint with the active player receiving priority first.
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
- `online-match-runtime.tsx` is mounted globally as the staged Online client bridge. It discovers the authenticated local room, reads only the server public game view, uses the pure guest-orientation helper and submits `declareAttackers` / `declareBlockers` through the authoritative room command API.
- While grouped attacker or blocker declaration is pending, a full-screen interaction layer blocks the legacy single-lane battlefield controls so both systems cannot mutate the same combat simultaneously.
- Attacker selection supports real extra attack uses, preselects obvious `Indomável` requirements and keeps the server as the final legality authority.
- Blocker selection displays every committed attack lane, allows repeated Defensor use up to visible capacity and sends one frozen assignment set to the server.
- A compact canonical Online HUD now displays current priority owner, timing window and readable stack frames from `priority` / `stack` instead of reconstructing them from local UI state.
- The pure `orientOnlineGameForRole` path flips canonical priority, stack, combat/finalization and decision ownership for the guest without mutating the server snapshot.
- Once `onlineCombat` reaches `declare-attackers`, the server requires the grouped command path: a legacy single `declareAttack` is rejected and `advancePhase` cannot skip a live grouped combat. Older/recovered snapshots that never entered canonical grouped combat may still use legacy combat compatibility outside that state.

## Phase 3 — Finalization ordering and response/blocker-clock separation implemented

- Online Combat→Finalization banks remaining main Energy before end-turn processing, respecting Reserve max 3 and `noReserveStorageThisTurn`.
- Energy is zeroed before the Finalization response checkpoint, so response spending observes the resources that actually exist after banking.
- Existing end-turn rule processing still comes from the shared deterministic engine.
- Finalization exposes an explicit response checkpoint before cleanup and turn handoff.
- After two passes, the shared engine performs hand-limit handling, cleanup and transition to the opponent's Maintenance.
- If end-turn processing creates a pending decision, Finalization waits for that decision and opens its response checkpoint only after the decision chain is complete.
- The active player's action clock is paused whenever a response window opens and resumes with the exact stored remainder when the stack returns to action priority.
- Every priority handoff receives a fresh response deadline without refilling the action clock.
- Ordinary actions no longer reset the turn timer; a newly active player receives a fresh turn clock.
- The defender-only `declare-blockers` step now also pauses the attacker's action clock and receives its own response-sized deadline.
- If the blocker deadline expires, the server authoritatively submits an empty blocker set and continues into the normal `after-blockers` response checkpoint; the client cannot extend the active player's clock by waiting.
- Legacy `sync` is rejected during `declare-attackers` and `declare-blockers`, preventing either player from bypassing the grouped authoritative command path with an older full-state synchronization.
- `priority.deadline` is reconciled together with the authoritative response/blocker deadline so the canonical UI snapshot cannot display a stale timeout value.

## Compatibility fields retained during migration

- `pendingAction`
- `pendingResponse`
- `priorityStack`
- `combatAction`

They remain compatibility inputs for the existing large match page while the server also exposes canonical `priority`, `stack`, `onlineCombat` and `onlineFinalization` state. The staged Online runtime consumes the canonical fields directly.

## Remaining work

- Run browser-level host/guest tests through the complete grouped combat sequence, including Combat-start, nested responses, reconnect during attacker/blocker checkpoints and stale-revision retries.
- Validate the staged runtime at multiple viewport sizes and browser zoom levels against the existing battlefield composition.
- After browser validation, fold the staged Online runtime into the canonical match client state flow and retire redundant legacy client combat/polling code without reintroducing a second rules path.
- Expand multiplayer telemetry/debug output for rejected stale commands and checkpoint timeouts so live-match desynchronization is diagnosable without exposing hidden zones.

No Offline/Bot game flow is routed through the new Online command kernel; only shared deterministic card/rule resolution remains common underneath it.

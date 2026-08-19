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
- `online-match-runtime.tsx` is mounted globally as the staged Online client bridge. It discovers and periodically reconciles the authenticated local room, reads only the server public game view, uses the pure guest-orientation helper and submits `declareAttackers` / `declareBlockers` through the authoritative room command API.
- While grouped attacker or blocker declaration is pending, a full-screen interaction layer blocks the legacy single-lane battlefield controls so both systems cannot mutate the same combat simultaneously.
- The server computes viewer-scoped legal attacker and blocker interaction data from the same authoritative engine preflight used on commit. Those choices are cached at the frozen declaration checkpoint so normal room polling does not repeatedly simulate every combat pair.
- Attacker selection supports real extra attack uses and preselects the authoritative mandatory `Indomável` count.
- Blocker selection displays every committed attack lane and consumes authoritative legal defender ids plus remaining `Defensor X` capacity.
- A compact canonical Online HUD displays current priority owner, timing window and readable stack frames from `priority` / `stack` instead of reconstructing them from local UI state.
- The pure `orientOnlineGameForRole` path flips canonical priority, stack, combat/finalization, grouped-interaction and decision ownership for the guest without mutating the server snapshot. Card/creature ids remain stable between perspectives.
- Once `onlineCombat` reaches `declare-attackers`, the server requires the grouped command path: a legacy single `declareAttack` is rejected and `advancePhase` cannot skip a live grouped combat. Older/recovered snapshots that never entered canonical grouped combat may still use legacy combat compatibility outside that state.
- Legacy full-state `sync` is rejected during grouped attacker/blocker declaration so an older client cannot bypass the authoritative declaration commands.
- Every modern Online command may carry a stable client command id; the server remembers the last 32 accepted ids per participant and acknowledges a retransmission before stale-revision validation, preventing a lost HTTP response or retry from applying the same action twice.

## Phase 3 — Finalization, clocks and reconnect semantics implemented

- Online Combat→Finalization banks remaining main Energy before end-turn processing, respecting Reserve max 3 and `noReserveStorageThisTurn`.
- Energy is zeroed before the Finalization response checkpoint, so response spending observes the resources that actually exist after banking.
- Existing end-turn rule processing still comes from the shared deterministic engine.
- Finalization exposes an explicit response checkpoint before cleanup and turn handoff.
- `remainUntilTurnEnd` support spells are defensively expired when Finalization is left, so interrupted/legacy snapshots cannot carry Tranqueira-Mática or similar temporary spell-permanents into the next turn.
- After two passes, the shared engine performs hand-limit handling, cleanup and transition to the opponent's Maintenance.
- If end-turn processing creates a pending decision, Finalization waits for that decision and opens its response checkpoint only after the decision chain is complete.
- The active player's action clock is paused whenever a response window opens and resumes with the exact stored remainder when the stack returns to action priority.
- Every priority handoff receives a fresh response deadline without refilling the action clock.
- Ordinary actions no longer reset the turn timer; a newly active player receives a fresh turn clock.
- The defender-only `declare-blockers` step also pauses the attacker's action clock and receives its own response-sized deadline.
- If the blocker deadline expires, the server authoritatively submits an empty blocker set and continues into the normal `after-blockers` response checkpoint; the client cannot extend the active player's clock by waiting.
- `priority.deadline` is reconciled together with the authoritative response/blocker deadline so the canonical UI snapshot cannot display a stale timeout value.
- Reconnecting inside the 60-second grace period shifts every absolute Online interaction deadline by the exact time spent disconnected: action turn, response, canonical priority, grouped blocker declaration, reposition and pending decision deadlines all remain paused together.
- If the 60-second reconnect grace expires, the server finishes the match and clears every interactive compatibility/canonical checkpoint (`pendingResponse`, `pendingAction`, priority stack, canonical stack, grouped/legacy combat, Finalization, decision/reposition and timers). The final priority view is `mode: none`, `owner: null`, `stackDepth: 0`.

## Validation status

The latest fully validated deployment ancestor is commit `d26c4594fc3dcf8145f18bc08b7cd0512dddee7b`. Its Vercel preview reached `READY`; project-maintenance and frontend-structure checks passed, `typecheck:ai` and `typecheck:online` passed, all 472 Node tests passed, AI smoke calibration was 24/24 and the Next.js production build completed successfully.

Later commits add the full two-perspective Host/Guest flow regression, reconnect deadline preservation/expiry cleanup, reconnect source regressions and expand `tsconfig.online.json` so strict Online typechecking also covers room-server and Online timing modules. Those later commits have not yet received a fresh Vercel build because the account hit the Vercel build-rate limit; that rate-limit status must not be treated as a code failure.

## Compatibility fields retained during migration

- `pendingAction`
- `pendingResponse`
- `priorityStack`
- `combatAction`

They remain compatibility inputs for the existing large match page while the server also exposes canonical `priority`, `stack`, `onlineCombat` and `onlineFinalization` state. The staged Online runtime consumes the canonical fields directly.

## Remaining work

- Obtain one fresh green build for the post-`d26c459` head, especially the expanded room-server `typecheck:online` surface and reconnect regressions.
- Perform manual/two-browser Host/Guest interaction validation through Combat-start, nested responses, grouped attack/block declaration, reconnect during each checkpoint and stale-revision retries. The current tool environment can validate server/perspective state and deployed HTML but cannot drive two authenticated browser sessions interactively.
- Inspect the staged runtime at multiple viewport sizes and browser zoom levels against the existing battlefield composition.
- After that validation, fold the staged Online runtime into the canonical match client state flow and retire redundant legacy client combat/polling code without reintroducing a second rules path.
- Expand multiplayer telemetry/debug output for rejected stale commands and checkpoint timeouts so live-match desynchronization is diagnosable without exposing hidden zones.

No Offline/Bot game flow is routed through the new Online command kernel; only shared deterministic card/rule resolution remains common underneath it.

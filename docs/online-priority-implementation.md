# Online priority implementation status

This file tracks the staged migration of Online mode to the timing model specified in `docs/online-priority-flow-rework.md`.

## Phase 1 — implemented

- Canonical `priority` metadata (`mode`, `owner`, `window`, consecutive passes, deadline and stack depth).
- Canonical read-only `stack` projection for UI/debug/telemetry while legacy `pendingAction` / `pendingResponse` / `priorityStack` remain compatibility fields.
- Server-only Online command kernel in `online-priority-engine.mjs`.
- Only the current `pendingResponse.responder` may answer or pass.
- A legal response after one pass is allowed; adding it resets the pass sequence.
- Two consecutive passes resolve one stack item, not the entire stack.
- After resolving a nested stack item, a fresh response cycle starts with the active player.
- Ending Main or Combat is now a response checkpoint in Online mode instead of an immediate phase jump.
- Online room commands and response timeouts route through the same priority kernel.
- Turn timeout no longer teleports across a live stack, combat exchange or pending decision.
- `activateHero` is part of the authoritative Online command allow-list.

## Compatibility fields retained during migration

- `pendingAction`
- `pendingResponse`
- `priorityStack`
- `combatAction`

They remain authoritative inputs for the existing UI until the client is migrated to consume the canonical `priority` and `stack` views directly.

## Phase 2 — next

- Replace one-attacker-at-a-time Online combat declaration with a committed attacker group.
- Add the explicit `combat-start`, `after-attackers`, `after-blockers`, `resolving` and `combat-end` checkpoints.
- Freeze blocker assignments before the single pre-damage response window.
- Resolve combat lanes left-to-right while pausing only for real triggered interactions.

## Phase 3 — next

- Split Finalization into: bank remaining Energy into Reserve (max 3), enqueue/resolve end-of-turn effects, response checkpoint, cleanup, then pass the turn.
- Ensure the opponent's thinking time uses the response clock instead of consuming the active player's action clock.
- Migrate the Online UI to render `priority.owner`, `priority.window` and canonical stack items.

No Offline/Bot rules are routed through the new Online kernel; the deterministic rules engine remains shared underneath it.

# Hemsfell presentation system

The presentation layer explains authoritative game transitions without owning them. Rules still resolve atomically in `app/rules-engine`; the browser only stages a confirmed before/after result.

## Action event

`app/presentation-event-bridge.tsx` is the application bridge. Local top-level command results arrive through the browser-only `hemsfell:rules-command-resolved` instrumentation facade in `app/rules-engine/engine.mjs`; the unchanged rules implementation itself lives in `engine-core.mjs`. Online presentation is built from `hemsfell:online-room-snapshot`, which `page.tsx` already emits from server room snapshots. The bridge associates a local Online command only when the HTTP response is successful and contains the authoritative game snapshot; polling/recovery revisions are presented as generic confirmed snapshot deltas instead of guessed commands.

The bridge dispatches `hemsfell:presentation-action` with `{ before, after, command, trace?, commandId, revision? }` only when the before/after pair contains a material game-state change. Opening a priority window or reserving a response cost therefore does not start a cinematic. When a later `passPriority` actually resolves a stacked/root action, the bridge recovers that resolved command from the authoritative pre-resolution priority state and presents the resulting transition. Combat declaration, blocker choice and combat damage remain excluded because `CombatAnimation` owns those interactions.

Rejected Online commands never produce a resolved action. Rules, priority and decisions do not wait for animation frames or clip durations: the runtime receives the already-resolved state, waits for two animation frames only so React can paint it, and then reads current `getBoundingClientRect()` geometry.

## Layers and sequencing

`GamePresentationRuntime` owns two pointer-transparent DOM layers:

- `.hh-motion-layer`: card flights between hand, field and piles.
- `.hh-effect-layer`: arrival rings, beams, impacts and floating labels.

The runtime serializes clips, deduplicates command ids and exposes `window.__hemsfellPresentationBusy` plus `hemsfell:presentation-busy` / `hemsfell:presentation-idle`. These signals are pacing-only: they never change or predict authoritative state.

## Existing presentation responsibilities

`VisualEffect` remains for genuinely large ability/damage moments that have not migrated yet. Ordinary summon, spell, artifact and terrain overlays are visually retired by `game-presentation.css`; those plays now use physical card motion on the board.

`CombatAnimation` remains the interaction UI for `declared`, `priority` and `choosing`, where a player may still respond or choose a blocker. PR1 deliberately excludes combat commands from the generic presentation queue so it cannot duplicate combat resolution.

The presentation layers are owned by `GamePresentationRuntime` itself and are removed on runtime unmount. `MatchUiGuard` continues to clean the legacy match overlays and does not delete the persistent `hh-*` runtime layers while navigating inside the app.

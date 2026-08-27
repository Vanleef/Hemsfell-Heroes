# Hemsfell presentation system

The presentation layer explains authoritative game transitions without owning them. Rules still resolve atomically in `app/rules-engine`; the browser only stages a confirmed before/after result.

## Action event

`app/presentation-event-bridge.tsx` is the application bridge. Local top-level command results arrive through the browser-only `hemsfell:rules-command-resolved` instrumentation facade in `app/rules-engine/engine.mjs`; the unchanged rules implementation itself lives in `engine-core.mjs`. Online presentation is built from `hemsfell:online-room-snapshot`, which `page.tsx` already emits from server room snapshots. The bridge associates a local Online command only when the HTTP response is successful and contains the authoritative game snapshot; polling/recovery revisions are presented as generic confirmed snapshot deltas instead of guessed commands.

The bridge dispatches `hemsfell:presentation-action` with `{ before, after, command, trace?, commandId, revision? }`. Rejected Online commands never produce a resolved action. Priority bookkeeping and combat interaction commands (`passPriority`, attack declaration, blocker choice and the authoritative combat hit) are excluded because priority must remain immediately interactive and `CombatAnimation` owns combat presentation.

The runtime waits for two animation frames after a confirmed transition before reading geometry, so animations use current `getBoundingClientRect()` values on desktop and mobile. Rules, priority and decisions never wait for animation frames or clip durations.

## Layers and sequencing

`GamePresentationRuntime` owns two pointer-transparent DOM layers:

- `.hh-motion-layer`: card flights between hand, field and piles.
- `.hh-effect-layer`: arrival rings, beams, impacts and floating labels.

The runtime serializes clips, deduplicates command ids and exposes `window.__hemsfellPresentationBusy` plus `hemsfell:presentation-busy` / `hemsfell:presentation-idle`. These signals are pacing-only: they never change or predict authoritative state.

## Existing presentation responsibilities

`VisualEffect` remains for genuinely large ability/damage moments that have not migrated yet. Ordinary summon, spell, artifact and terrain overlays are visually retired by `game-presentation.css`; those plays now use physical card motion on the board.

`CombatAnimation` remains the interaction UI for `declared`, `priority` and `choosing`, where a player may still respond or choose a blocker. PR1 deliberately excludes those combat commands from the generic presentation queue so it cannot delay priority or duplicate combat resolution.

The presentation layers are owned by `GamePresentationRuntime` itself and are removed on runtime unmount. `MatchUiGuard` continues to clean the legacy match overlays and does not delete the persistent `hh-*` runtime layers while navigating inside the app.

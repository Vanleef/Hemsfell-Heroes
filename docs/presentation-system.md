# Hemsfell presentation system

The presentation layer explains authoritative game transitions without owning them. Rules still resolve atomically in `app/rules-engine`; the browser only stages a confirmed before/after result.

## Action event

`app/presentation-event-bridge.tsx` is the application bridge. Local top-level command results arrive through the browser-only `hemsfell:rules-command-resolved` instrumentation facade in `app/rules-engine/engine.mjs`; the unchanged rules implementation itself lives in `engine-core.mjs`. Online presentation is built from `hemsfell:online-room-snapshot`, which `page.tsx` already emits from server room snapshots. The bridge associates a local Online command only when the HTTP response is successful and contains the authoritative game snapshot; polling/recovery revisions are presented as generic confirmed snapshot deltas instead of guessed commands.

The bridge dispatches `hemsfell:presentation-action` with `{ before, after, command, trace?, commandId, revision? }` only when the before/after pair contains a material game-state change. It also keeps a bounded transition fingerprint cache, so the same authoritative before/after transition cannot be staged twice even if it is observed through more than one client path. Opening a priority window or reserving a response cost therefore does not start a cinematic.

When a later `passPriority` actually resolves a stacked/root action, the bridge recovers that resolved command from the authoritative pre-resolution priority state. The Online single-attack checkpoint is converted back into the resolved `attack` command, including attacker, blocker or direct-Hero target. Guest snapshots mirror player and nested priority ownership before this recovery. Rejected Online commands never produce a resolved presentation action.

Rules, priority and decisions do not depend on animation frames or clip durations. The presentation runtimes receive an already-confirmed state transition and only then stage visuals.

## Layers and sequencing

`GamePresentationRuntime` owns the physical-card/effect layers:

- `.hh-motion-layer`: card flights between hand, field and piles.
- `.hh-effect-layer`: arrival rings, spell beams, impacts and floating labels.

`GameActionCuesRuntime` owns `.hh-action-cue-layer` for resolved combat and targeted-effect readability. Creature-versus-creature combat launches one sword cue from each creature into a central clash. Direct attacks launch a sword from the attacker toward the damaged Hero. Activated and other targeted effects can launch a magic projectile toward affected permanents/Heroes; spell casts continue to use the existing cast flight and target beams instead of duplicating that cue.

Both runtimes are one-shot consumers. The bridge deduplicates authoritative transitions and the cue runtime maintains its own bounded seen-key cache as a second guard.

## Input and AI pacing

`GamePresentationRuntime` exposes `window.__hemsfellPresentationBusy` plus `hemsfell:presentation-busy` / `hemsfell:presentation-idle`. `GameActionCuesRuntime` exposes the equivalent `__hemsfellPresentationCueBusy` and cue busy/idle events.

`PresentationInteractionRuntime` treats either busy flag as a hard match input boundary. While presentation is active, pointer/click/drag/keyboard actions inside the match are intercepted, `.screen-game` is marked `aria-busy`, and the player's hand is rendered with the same unavailable visual language used for cards that cannot currently be played. Input becomes available only after both queues are idle.

The original `ai-system/runtime.ts` remains the single AI runtime surface. Normal decisions and priority-response searches await presentation idle before starting. Once idle, priority computation still uses its existing 850 ms hard search deadline. A long fail-safe exists only to recover from catastrophic presentation-runtime teardown, not as normal pacing.

## Glossary authority

`game-glossary.ts` is the canonical rule-copy dictionary. `GameGlossaryRuntime` normalizes the legacy `.keyword-term`, `.keyword-badge`, `data-keyword` and `data-status` elements to that dictionary before `CardPreviewRuntime` reads them. It updates `data-tip`, exposes semantic tone metadata and removes competing native `title` attributes. `CardPreviewRuntime` remains the sole owner of the interactive Floating UI card and nested glossary surfaces.

## Existing presentation responsibilities

`VisualEffect` remains for genuinely large ability/damage moments that have not migrated yet. Ordinary summon, spell, artifact and terrain overlays are visually retired by `game-presentation.css`; those plays use physical card motion on the board.

`CombatAnimation` remains the interaction UI for declaration, priority and blocker choice. Those pre-resolution stages are not animated as damage. Only the confirmed attack-resolution transition enters the action-cue layer.

The persistent `hh-*` layers are removed by their own runtimes on unmount. `MatchUiGuard` continues to clean legacy match overlays without deleting the presentation runtimes while navigating inside the app.

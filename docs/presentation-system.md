# Hemsfell presentation system

The presentation layer explains authoritative game transitions without owning them. Rules still resolve atomically in `app/rules-engine`; the browser only stages the confirmed before/after result.

## Action event

`app/page.tsx` is the bridge. After a local `executeCommand` succeeds, or after an Online room command receives its confirmed snapshot, it dispatches `hemsfell:presentation-action` with `{ before, after, command, trace, commandId?, revision? }`. An Online rejection emits no resolved action event. Presentation never dispatches or depends on an `after: null` state.

The runtime waits for React to paint the confirmed state before reading geometry, so animations use current `getBoundingClientRect()` values on desktop and mobile. Rules, priority and decisions never wait for animation frames or clip durations.

## Layers and sequencing

`GamePresentationRuntime` owns two pointer-transparent DOM layers:

- `.hh-motion-layer`: card flights between hand, field and piles.
- `.hh-effect-layer`: arrival rings, beams, impacts and floating labels.

The runtime serializes action clips and exposes presentation busy/idle state so bot turns do not stack gameplay actions over an unfinished board animation. Confirmed Online commands are deduplicated by command id/revision before being staged.

## Existing presentation responsibilities

`VisualEffect` remains for genuinely large moments such as hero evolution, legendary-scale moments and board-wide chains. Ordinary draw, summon, cast and destroy transitions are presented directly on the board instead of opening the large overlay.

`CombatAnimation` remains the interaction UI for `declared`, `priority` and `choosing`, where a player may still respond or choose a blocker. PR1 does not replace those stages with a lunge or pre-play damage. Later charging/impact polish may animate the resolved board state, but it must continue to follow the same authoritative snapshot contract.

`MatchUiGuard` removes presentation-layer leftovers when leaving a match, alongside the existing combat/visual overlays.

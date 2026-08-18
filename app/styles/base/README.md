# Base style ownership

The global cascade entrypoints stay at their existing paths for compatibility:

1. `app/globals.css`
2. `app/game.css`
3. `app/lab.css`
4. `app/ui-overrides.css`
5. `app/magic-barrier.css`
6. `app/match-ui.css` (imported by `layout.tsx` after `globals.css`)

They are intentionally not moved in this behavior-preserving refactor because import location and raw file contents are part of the current regression contract.

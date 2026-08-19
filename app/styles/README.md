# Frontend styles

The historical root stylesheets remain the runtime/compatibility contracts because existing regression tests inspect their raw source text as well as the browser output.

- `base/` documents global entrypoint ownership; those files intentionally remain at their historical paths.
- `board/` contains byte-identical structural mirrors of the board layers consumed by `lab.css`.
- `match/` contains byte-identical structural mirrors of the match-specific layers consumed by `match-ui.css`.
- `scripts/verify-frontend-structure.mjs` fails if any mirror drifts from its compatibility source or if cascade order changes.

This gives the project a navigable responsibility map without changing selectors, declaration values, import order or CSS resolution behavior. Do not promote a mirror to a new runtime path without a separate visual-regression migration.

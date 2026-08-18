# Scripts

This directory contains reusable project tooling only.

## Canonical policy

- Do not add one-off `fix-*`, `repair-*`, `apply-*`, `normalize-*`, `prepare-card*`, or `finalize-*` patch scripts.
- Make durable changes directly in the canonical source files instead of layering source mutators.
- Match UI DOM guards live in `app/match-ui-runtime.tsx` and `app/match-ui-guard.tsx`.
- Match CSS is imported through the single `app/match-ui.css` entry point.
- GitHub Actions should use the canonical CI workflow rather than accumulating temporary fix workflows.
- `scripts/project-maintenance.mjs` enforces these rules and validates canonical CSS imports.

## Reusable commands

- `npm run prepare:project` — validate the canonical project state.
- `npm run test:rules` — run rules and regression tests.
- `npm run audit:cards:full` — export the card implementation audit.
- `npm run simulate:headless` — run headless game simulations.
- `npm run ai:calibrate` — run the full AI calibration corpus across all configured difficulties.
- `npm run ai:calibrate:smoke` — run the deterministic AI calibration smoke subset.
- `npm run ai:calibrate:benchmark` — run the deterministic 48-scenario benchmark for Easy, Normal and Hard; CI uses this command for strategic regression measurement.
- `npm run ai:selfplay` — run AI-vs-AI self-play telemetry.

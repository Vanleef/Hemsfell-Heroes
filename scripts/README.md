# Scripts

This directory contains reusable project tooling only.

## Canonical policy

- Do not add one-off `fix-*`, `repair-*`, `apply-*`, `normalize-*`, `prepare-card*`, or `finalize-*` patch scripts.
- Make durable changes directly in the canonical source files instead of layering source mutators.
- Match UI DOM guards remain at the compatibility entrypoints `app/match-ui-runtime.tsx` and `app/match-ui-guard.tsx`; `app/ui/runtime/` groups them without changing lifecycle order.
- Match CSS is imported through the single `app/match-ui.css` entry point.
- `app/styles/` mirrors CSS by responsibility while the historical root paths remain byte-identical compatibility contracts.
- GitHub Actions should use the canonical CI workflow rather than accumulating temporary fix workflows.
- `scripts/project-maintenance.mjs` validates the canonical project state; `scripts/verify-frontend-structure.mjs` additionally protects stylesheet bytes, cascade order and match runtime order.

## Reusable commands

- `npm run prepare:project` — validate the canonical project state and frontend structural invariants.
- `npm run verify:frontend-structure` — verify stylesheet mirrors and UI/cascade ordering without mutating source.
- `npm run test:rules` — run rules and regression tests.
- `npm run audit:cards:full` — export the card implementation audit.
- `npm run simulate:headless` — run headless game simulations.
- `npm run ai:calibrate` — run the full AI calibration corpus across all configured difficulties.
- `npm run ai:calibrate:smoke` — run the deterministic AI calibration smoke subset.
- `npm run ai:calibrate:benchmark` — run the deterministic 48-scenario benchmark for Easy, Normal and Hard; CI uses this command for strategic regression measurement.
- `npm run ai:selfplay` — run AI-vs-AI self-play telemetry.

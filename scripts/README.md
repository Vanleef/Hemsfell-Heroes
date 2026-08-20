# Scripts

This directory contains reusable project tooling only.

## Canonical policy

- Do not add one-off `fix-*`, `repair-*`, `apply-*`, `normalize-*`, `prepare-card*`, or `finalize-*` patch scripts.
- Make durable changes directly in the canonical source files instead of layering source mutators.
- Match UI DOM guards remain at the compatibility entrypoints `app/match-ui-runtime.tsx` and `app/match-ui-guard.tsx`; no barrel-only facade is required.
- Match CSS is imported through the single `app/match-ui.css` entry point. Board CSS continues through `app/lab.css` while the historical `lab-legacy.css` remains isolated from the modern geometry layers.
- Do not add byte-identical CSS mirror trees; responsibility is documented by the canonical runtime files themselves.
- GitHub Actions should use the canonical CI workflow rather than accumulating temporary fix workflows.
- `scripts/project-maintenance.mjs` validates canonical files, stylesheet import/cascade order, match runtime order, card catalog invariants and the absence of one-off source mutators.

## Reusable commands

- `npm run prepare:project` — validate canonical project state and frontend structural invariants.
- `npm run test:rules` — run rules and regression tests.
- `npm run audit:cards:full` — export the card implementation audit.
- `npm run simulate:headless` — run headless game simulations.
- `npm run ai:calibrate` — run the full AI calibration corpus across all configured difficulties.
- `npm run ai:calibrate:smoke` — run the deterministic AI calibration smoke subset.
- `npm run ai:calibrate:benchmark` — run the deterministic benchmark for Easy, Normal and Hard.
- `npm run ai:selfplay` — run AI-vs-AI self-play telemetry.

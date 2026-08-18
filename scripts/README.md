# Scripts policy

The runtime source under `app/`, the rules engine, tests and stylesheets are canonical. Development and build flows must never reconstruct the application by replaying historical patch scripts.

## Maintenance model

- `project-maintenance.mjs` is the single pre-dev/pre-build integrity gate. It validates the committed canonical state and does not rewrite source files.
- Bug fixes and gameplay changes go directly into `app/`, `app/rules-engine/`, tests and the existing stylesheet responsible for that UI surface.
- Do not commit `repair-vNN`, `fix-*`, `apply-*`, `normalize-*` or similar one-off scripts. Git history already preserves migrations and previous implementations.
- Do not create one-off GitHub Actions workflows that edit source code. `.github/workflows/ci.yml` is the canonical automation workflow.
- Add a new executable script only for genuinely reusable tooling such as build, CI environment setup, audit, simulation or extraction. Prefer adding a command/mode to an existing tool when concerns belong together.
- `card-tools.mjs` groups catalog extraction and manual-card analysis instead of keeping separate tiny scripts.
- `audit-card-rules.mjs` and `export-card-implementation-audit.mjs` remain separate because one is a fast audit and the other exports a persistent implementation report.

## UI organization

Match UI runtime helpers are consolidated in `app/match-ui-runtime.tsx`, with `app/match-ui-guard.tsx` retained as the canonical lifecycle/integrity guard. Match-specific CSS is exposed through the single `app/match-ui.css` entry point; small fixes should be folded into an existing responsibility stylesheet instead of adding another import to `layout.tsx`.

`npm run rules:migrate` remains only as a compatibility alias for `npm run prepare:project`; it does not mutate the repository.

# Scripts policy

The runtime source under `app/`, the rules engine, tests and stylesheets are canonical. Build/dev must not reconstruct the application by replaying a long chain of historical patch scripts.

## Maintenance model

- `project-maintenance.mjs` is the single pre-dev/pre-build gate. It validates the committed canonical state and does not rewrite source files.
- Bug fixes and gameplay changes should be made directly in `app/`, `app/rules-engine/`, tests and the relevant stylesheet.
- Do not create `repair-vNN`, `fix-*`, `apply-*`, `normalize-*` or similar one-off scripts for ordinary changes. Git history already preserves migrations and previous implementations.
- Add a new executable script only when the operation is genuinely reusable tooling (build, CI environment, audit, simulation, extraction, etc.). Prefer adding a command/mode to an existing tool when the concerns belong together.
- `card-tools.mjs` groups catalog extraction and manual-card analysis instead of keeping separate tiny scripts.
- `audit-card-rules.mjs` / `export-card-implementation-audit.mjs` remain separate because one is a fast CI check and the other generates persistent reports.

Two legacy reference scripts (`repair-runtime-ai-cost-v18.mjs` and `repair-board-visual-polish-v20.mjs`) are intentionally preserved but are not part of dev/build execution. The actual v18/v20 runtime/style state remains committed in canonical files.

`npm run rules:migrate` is retained only as a compatibility alias for `npm run prepare:project`; it no longer mutates the repository.

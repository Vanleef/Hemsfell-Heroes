# Frontend structure refactor — behavior-preserving plan

This branch is restricted to structural cleanup. Gameplay, AI, rules, timing, selectors, visual output and runtime side-effect order are frozen.

## Frozen behavior surfaces

- `app/page.tsx`
- `app/layout.tsx` runtime imports/render order
- `app/rules-engine/**`
- `app/api/**`
- card/rule data and generated catalogs
- DOM class names, ids and data attributes
- CSS selector text, declaration values and cascade order

## Current organization

- Historical CSS files remain direct compatibility sources because regression tests inspect selectors and raw text. There are no active `app/styles/` mirrors on `main`.
- `app/layout.tsx` retains direct imports and the established runtime/component order.
- Match-specific controllers and views live in `app/match/`; presentation bridges and runtimes remain explicit files in `app/`.
- Tutorial data is isolated in `app/tutorial-content.ts`, while `app/tutorial-screen.tsx` owns rendering and interaction. Keyword copy is derived from `app/game-glossary.ts`.
- The current layer map and dependency direction are documented in `docs/architecture.md`; this document defines the stricter front-end refactor guardrails.

## Safety rules

1. Stylesheet import order is preserved exactly.
2. No CSS selector, class, ID or `data-*` contract is renamed during a structural-only change.
3. No rule-engine or advanced-AI source is modified by this refactor.
4. `app/page.tsx` and the runtime contents of `app/layout.tsx` remain unchanged from the branch base.
5. Uncertain code is retained; no usage is inferred from filename/search absence alone.
6. Match UI runtime component order remains `MatchUiGuard` then `MatchUiRuntime`.
7. Every structural invariant is verified with tests/typechecks before merge.

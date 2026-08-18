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

## Applied organization

- `app/styles/base/` documents ownership of the stable global cascade entrypoints.
- `app/styles/board/` groups byte-identical mirrors of board geometry, tuning and legacy board layers.
- `app/styles/match/` groups byte-identical mirrors of match overlays, response, decisions, inspectors, card lists and result/log presentation.
- Historical CSS paths remain full compatibility sources because regression tests inspect their raw text; they are not converted to forwarding shims.
- `app/ui/runtime/` provides an optional grouped export boundary for the existing client runtime modules; `layout.tsx` deliberately retains its historical direct imports and component order.
- `app/ui/components/` provides a stable component export boundary without relocating rendering implementations.
- `scripts/verify-frontend-structure.mjs` verifies CSS mirror identity plus cascade/runtime ordering on every `prepare:project` run.

## Safety rules

1. Organized stylesheet mirrors are byte-identical to their historical compatibility files.
2. Stylesheet import order is preserved exactly.
3. No CSS selector is renamed or rewritten.
4. No rule-engine or advanced-AI source is modified by this refactor.
5. `app/page.tsx` and the runtime contents of `app/layout.tsx` remain unchanged from the branch base.
6. Uncertain code is retained; no usage is inferred from filename/search absence alone.
7. Match UI runtime component order remains `MatchUiGuard` then `MatchUiRuntime`.
8. Every structural invariant is checked without mutating source.

# UI boundaries

The existing UI runtime files remain at their historical paths for compatibility. This directory provides stable grouping boundaries without moving side-effectful modules or changing their execution order.

- `runtime/` groups the match DOM guard/runtime entrypoints.
- `components/` groups reusable rendering components.

Do not move a side-effectful client module merely for aesthetics; preserve module evaluation and React lifecycle order first.

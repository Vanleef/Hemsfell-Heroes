import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [readme, architecture, frontendPlan] = await Promise.all([
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/architecture.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/frontend-structure-refactor.md", import.meta.url), "utf8"),
]);

test("developer onboarding points to current architecture and commands", () => {
  assert.match(readme, /## Primeiros 15 minutos/);
  assert.match(readme, /docs\/architecture\.md/);
  assert.match(readme, /npm run typecheck:ai/);
  assert.match(readme, /npm run typecheck:online/);
  assert.match(readme, /npm run test:node/);
  assert.match(readme, /simulator\.mjs/);
  assert.doesNotMatch(readme, /simulation\.mjs/);
  assert.doesNotMatch(readme, /Branch ativa de mecânicas/);
});

test("architecture documents authority, layers and presentation boundary", () => {
  for (const layer of ["Model / Rules Engine", "Application / Session", "View / Presentation", "Data / Catalog", "Infrastructure"]) {
    assert.match(architecture, new RegExp(layer.replace("/", "\\/")));
  }
  assert.match(architecture, /Uma única autoridade de estado/);
  assert.match(architecture, /Dois passes consecutivos resolvem somente o topo/);
  assert.match(architecture, /animações.*nunca a resolução autoritativa/i);
});

test("frontend refactor plan describes the repository that exists on main", () => {
  assert.match(frontendPlan, /There are no active `app\/styles\/` mirrors on `main`/);
  assert.match(frontendPlan, /app\/tutorial-content\.ts/);
  assert.doesNotMatch(frontendPlan, /scripts\/verify-frontend-structure\.mjs/);
});

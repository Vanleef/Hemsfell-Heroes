import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../app/presentation/runtime/match-requested-ui-runtime.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/presentation/styles/priority-card-anchor-terminal.css", import.meta.url), "utf8");

const labels = [
  "Dragões em campo",
  "Cartas neste turno",
  "Feitiços conjurados",
  "Mortes aliadas",
  "Perdas de vida",
  "Ataques do Comandante",
  "Criaturas aliadas únicas",
  "Gatos",
  "Pistas",
  "Constantes",
  "Marcadores",
];

test("every canonical hero has a concise evolution-progress label", () => {
  for (const label of labels) assert.match(runtime, new RegExp(label));
  assert.match(runtime, /HERO_PROGRESS_LABELS/);
  assert.match(runtime, /hero-short-name/);
});

test("short progress keeps the authoritative counter and collapses to one visible line", () => {
  assert.match(runtime, /strong\.textContent/);
  assert.match(runtime, /`\$\{counter\} \$\{label\}`/);
  assert.match(runtime, /strong\.hidden = true/);
  assert.match(runtime, /EVOLUÇÃO CONCLUÍDA/);
  assert.match(runtime, /hhShortProgress/);
  assert.match(css, /data-hh-short-progress="true"/);
  assert.match(css, /white-space:\s*nowrap\s*!important/);
  assert.match(css, /text-overflow:\s*clip\s*!important/);
});

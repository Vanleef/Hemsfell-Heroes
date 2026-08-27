import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { isValidTarget, targetPolicy, cardPlayTargetPolicy, TargetScope } from "../app/rules-engine/targeting.mjs";

const [page, runtime, matchCss] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/card-preview-runtime.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/match-ui.css", import.meta.url), "utf8"),
]);

const manualTerms = [
  "Constante", "Sacrificar", "Banir", "Destruir", "Pagar", "Ofensividade",
  "Vitalidade", "Bloquear", "Virar", "Desvirar", "Marcador", "+X/+Y", "Turno",
  "Recupere X", "Vincular", "Voar", "Barreira Mágica", "Atropelar", "Triturar",
  "Primeiro Ato", "Último Suspiro", "Investida", "Indomável", "Furtivo", "Veloz",
  "Robusto", "Defensor X", "Roubo de Vida", "Toque da Morte", "Acelerado",
  "Congelado", "Atordoado", "Sufocado", "Suporte", "Imobilizado",
  "Indestrutível", "Investigar X", "Fura-Fila",
];

test("manual glossary terms all have game-owned explanations", () => {
  for (const term of manualTerms) {
    assert.match(page, new RegExp(`"${term.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&")}":"[^"]+"`), `missing glossary description for ${term}`);
  }
  assert.match(page, /data-glossary-kind=\{keyword\.kind\}/);
  assert.ok(page.includes("|\\+\\d+\\s*\\/\\s*\\+\\d+|"));
  assert.match(page, /"sufocar":"Sufocado"/);
});

test("live keywords, buffs and debuffs use the custom simple tooltip", () => {
  assert.match(page, /const positiveStatuses=/);
  assert.match(page, /className="field-positive-statuses"/);
  assert.match(page, /className="field-negative-statuses"/);
  assert.match(page, /data-game-tip=\{status\.tip\}/);
  assert.match(page, /data-game-tip=\{keywordDescriptions\[name\]\}/);
  assert.match(runtime, /\[data-game-tip\]/);
  assert.match(runtime, /kind: \(trigger\.dataset\.gameTipKind as GlossaryKind\)/);
  assert.match(runtime, /if \(!preview && !glossary\) return null/);
  assert.match(matchCss, /\.card-glossary-floating\[data-kind="positive"\]/);
  assert.match(matchCss, /\.card-glossary-floating\[data-kind="negative"\]/);
});

test("Silêncio Ensurdecedor requires and selects a permanent, never a hero", () => {
  const rawPolicy = targetPolicy("Aplique Sufocar na carta alvo no campo.");
  assert.equal(rawPolicy.scope, TargetScope.ANY_PERMANENT);
  assert.equal(rawPolicy.selections, 1);
  assert.equal(isValidTarget(rawPolicy, 0, 1, "hero"), false);

  const silence = compileCard({
    id: "p147",
    page: 147,
    name: "Silêncio Ensurdecedor",
    type: "Encanto",
    cost: 3,
    text: "Aplique Sufocar na carta alvo no campo.",
  });
  const compiledPolicy = cardPlayTargetPolicy(silence);
  assert.equal(compiledPolicy.scope, TargetScope.ANY_PERMANENT);
  assert.equal(compiledPolicy.selections, 1);
  assert.match(page, /const allowsHeroTarget=.*cardPlayTargetPolicy/);
  assert.match(page, /não pode ser jogada porque não existem alvos válidos suficientes/);
});

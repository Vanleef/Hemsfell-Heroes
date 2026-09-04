import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/hero-ability-detail-runtime.tsx", "utf8");
const gate = fs.readFileSync("app/presentation/runtime/match-runtime-gate.tsx", "utf8");

const heroKeys = ["gimble", "goblin", "uruk", "tifon", "saymon", "tessalia", "quarion", "rasmus", "ngoro", "zayan", "natureza"];

test("every canonical hero exposes three concise card-faithful tooltip descriptions", () => {
  for (const hero of heroKeys) {
    assert.match(runtime, new RegExp(`\\b${hero}: \\[`, "i"));
  }
  assert.match(runtime, /type AbilityTriplet = readonly \[AbilityDetail, AbilityDetail, AbilityDetail\]/);
  assert.match(runtime, /chip\.dataset\.abilityTooltip = next/);
  assert.match(runtime, /chip\.dataset\.abilityDetailSource = "hero-card-text"/);
});

test("Uruk I preserves the printed four-element wording without extra rule prose", () => {
  assert.match(runtime, /Fogo: 1 de dano a um alvo/);
  assert.match(runtime, /Terra: compre 1 carta/);
  assert.match(runtime, /Água: restaure 1 de vida/);
  assert.match(runtime, /Ar: receba 1 de Energia/);
  assert.doesNotMatch(runtime, /Se nenhum Feitiço com elemento tiver sido registrado/);
});

test("card-facing limits and costs stay concise and faithful to the printed hero text", () => {
  assert.match(runtime, /tifon:[\s\S]*?Máx\. 3 por turno/i);
  assert.match(runtime, /saymon:[\s\S]*?Pague 2 de vida:[\s\S]*?Limite de 1 vez por turno/i);
  assert.match(runtime, /ngoro:[\s\S]*?Gaste 2 Pistas[\s\S]*?Gaste 3 Pistas/i);
  assert.match(runtime, /natureza:[\s\S]*?Uma vez por turno[\s\S]*?Remova 4 marcadores de ação/i);
});

test("detail runtime mounts before the ability rail reads tooltip semantics", () => {
  const detailImport = gate.indexOf('import("./hero-ability-detail-runtime")');
  const railImport = gate.indexOf('import("./hero-ability-rail-runtime")');
  const detailMount = gate.indexOf("<HeroAbilityDetailRuntime />");
  const railMount = gate.indexOf("<HeroAbilityRailRuntime />");
  assert.ok(detailImport >= 0 && railImport > detailImport);
  assert.ok(detailMount >= 0 && railMount > detailMount);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/hero-ability-detail-runtime.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const heroKeys = ["gimble", "goblin", "uruk", "tifon", "saymon", "tessalia", "quarion", "rasmus", "ngoro", "zayan", "natureza"];

test("every canonical hero exposes three detailed tooltip descriptions", () => {
  for (const hero of heroKeys) {
    assert.match(runtime, new RegExp(`\\b${hero}: \\[`, "i"));
  }
  assert.match(runtime, /type AbilityTriplet = readonly \[AbilityDetail, AbilityDetail, AbilityDetail\]/);
  assert.match(runtime, /chip\.dataset\.abilityTooltip = next/);
  assert.match(runtime, /chip\.dataset\.abilityDetailSource = "canonical-rules"/);
});

test("Uruk I enumerates the complete effect of all four elements", () => {
  assert.match(runtime, /Terra: compre 1 carta/);
  assert.match(runtime, /Água: cure 1 de vida do seu herói/);
  assert.match(runtime, /Ar: ganhe 1 de Energia principal/);
  assert.match(runtime, /Fogo: escolha qualquer personagem válido e cause 1 de dano/);
});

test("detailed copy preserves important limits, costs and durations", () => {
  assert.match(runtime, /tifon:[\s\S]*?A primeira vez em cada um dos seus turnos/i);
  assert.match(runtime, /saymon:[\s\S]*?pague 2 de vida[\s\S]*?Roubo de Vida permanentemente/i);
  assert.match(runtime, /ngoro:[\s\S]*?Remova 2 Pistas[\s\S]*?Remova 3 Pistas/i);
  assert.match(runtime, /natureza:[\s\S]*?Uma vez por turno[\s\S]*?Remova um total de 4 marcadores/i);
});

test("detail runtime mounts before the ability rail reads tooltip semantics", () => {
  const detailImport = layout.indexOf('import HeroAbilityDetailRuntime from "./presentation/runtime/hero-ability-detail-runtime"');
  const railImport = layout.indexOf('import HeroAbilityRailRuntime from "./presentation/runtime/hero-ability-rail-runtime"');
  const detailMount = layout.indexOf("<HeroAbilityDetailRuntime />");
  const railMount = layout.indexOf("<HeroAbilityRailRuntime />");
  assert.ok(detailImport >= 0 && railImport > detailImport);
  assert.ok(detailMount >= 0 && railMount > detailMount);
});

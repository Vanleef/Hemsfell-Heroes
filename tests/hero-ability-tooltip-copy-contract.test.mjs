import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("app/presentation/runtime/hero-ability-rail-runtime.tsx", "utf8").replace(/\s+/g, " ");

test("hero ability tooltip copy strips generic repeated activation explanations", () => {
  assert.match(runtime, /function cleanAbilityTooltip\(copy: string, heroKey: string, slot: number\)/);
  assert.match(runtime, /Depois de ativada, esta habilidade segue as condições e os alvos descritos acima/);
  assert.match(runtime, /Efeito passivo:/);
  assert.match(runtime, /Pague 2 de vida para causar 1 de dano a um alvo\. Uma vez por turno\./);
  assert.match(runtime, /Pague 2 de vida para dar Roubo de Vida a uma criatura\./);
});

test("hero ability glyph sets are distinct within every hero", () => {
  const sets = [...runtime.matchAll(/\w+: \["([^"]+)", "([^"]+)", "([^"]+)"\]/g)];
  assert.ok(sets.length >= 11, "expected glyph sets for every hero");
  for (const [, first, second, third] of sets) {
    assert.equal(new Set([first, second, third]).size, 3, `duplicate glyph in [${first}, ${second}, ${third}]`);
  }
  assert.match(runtime, /saymon: \["✹", "♥", "⛨"\]/);
});

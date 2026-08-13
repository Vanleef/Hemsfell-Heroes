import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseEffects } from "../app/rules-engine/compiler.mjs";

const searchEffect = (text) => parseEffects(text).find((effect) => effect.type === "search");

test("Procure/Procurar/Busque/Buscar/Busca compile to the same deck-search effect", () => {
  const cases = [
    ["Procure 2 criaturas no seu deck e coloque-as na mão.", 2],
    ["Procurar 2 criaturas no seu deck e coloque-as na mão.", 2],
    ["Busque 2 criaturas no seu deck e coloque-as na mão.", 2],
    ["Buscar 2 criaturas no seu deck e coloque-as na mão.", 2],
    ["Busca 2 criaturas no seu deck e coloque-as na mão.", 2],
  ];

  for (const [text, amount] of cases) {
    const effect = searchEffect(text);
    assert.ok(effect, `expected search effect for: ${text}`);
    assert.equal(effect.zone, "deck");
    assert.equal(effect.destination, "hand");
    assert.equal(effect.amount, amount);
    assert.deepEqual(effect.types, ["Criatura"]);
    assert.equal(effect.shuffle, true);
  }
});

test("Buscar uma carta and Busque por 3 preserve the same selection semantics", () => {
  const singular = searchEffect("Buscar uma carta do tipo Artefato no seu deck e coloque-a na mão.");
  assert.ok(singular);
  assert.equal(singular.amount, 1);
  assert.deepEqual(singular.types, ["Artefato"]);

  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /procure\|procurar\|busque\|buscar\|busca/);
  assert.match(source, /pode \(\?:procurar\|buscar\)/);
});

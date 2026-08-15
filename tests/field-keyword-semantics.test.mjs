import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { hasIntrinsicKeyword, intrinsicKeywordNames } from "../app/card-keywords.mjs";

test("Liaz rules text does not activate conditional Furtivo or Barreira Magica", () => {
  const liaz = compileCard({
    id: "p263",
    page: 263,
    name: "Liaz",
    type: "Criatura",
    cost: 4,
    atk: 3,
    hp: 4,
    text: "Durante um Investigar, ao Revelar: Criatura→ Cause 1 dano a uma criatura inimiga. Feitiço→ Essa carta ganha Barreira Magica. Artefato→ Essa carta ganha Furtivo. Os efeitos duram até o fim do turno.",
    tags: ["Furtivo"],
  });

  assert.equal(hasIntrinsicKeyword(liaz, "Furtivo"), false);
  assert.equal(hasIntrinsicKeyword(liaz, "Barreira Mágica"), false);

  const active = { ...liaz, temporaryTags: ["Furtivo", "Barreira Mágica"] };
  assert.equal(hasIntrinsicKeyword(active, "Furtivo"), true);
  assert.equal(hasIntrinsicKeyword(active, "Barreira Mágica"), true);
});

test("Cria de Ladino exposes Ultimo Suspiro icon from its authoritative onDestroyed trigger", () => {
  const cria = compileCard({
    id: "p256",
    page: 256,
    name: "Cria de Ladino",
    type: "Criatura",
    cost: 1,
    atk: 0,
    hp: 1,
    text: "Ultimo Suspiro: O oponente Tritura 2 cartas.",
    tags: [],
  });

  assert.ok(cria.abilities.some((ability) => ability.trigger === "onDestroyed"));
  assert.ok(intrinsicKeywordNames(cria).includes("Último Suspiro"));
});

test("printed static keywords still come from authoritative static abilities when tags are absent", () => {
  const infiltrator = compileCard({
    id: "p259",
    page: 259,
    name: "Infiltrador",
    type: "Criatura",
    cost: 1,
    atk: 1,
    hp: 1,
    text: "Furtivo.",
    tags: [],
  });

  assert.equal(hasIntrinsicKeyword(infiltrator, "Furtivo"), true);
});

test("battlefield UI consumes semantic keywords instead of activating words found in rules text", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /hasIntrinsicKeyword\(u,keyword\)/);
  assert.match(page, /intrinsicKeywordNames\(unit\)/);
  const hasKeywordSource = page.match(/const hasKeyword=.*?;\n/)?.[0] || "";
  assert.doesNotMatch(hasKeywordSource, /matches\(u\.text\)/);
});

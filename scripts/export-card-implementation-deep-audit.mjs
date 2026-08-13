import { readFile, writeFile } from "node:fs/promises";
import rawCards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { canExecuteCard } from "../app/rules-engine/engine.mjs";

const SOURCE_FILES = ["app/rules-engine/card-rules.mjs","app/rules-engine/compiler.mjs","app/rules-engine/effects.mjs","app/rules-engine/engine.mjs","app/rules-engine/targeting.mjs","app/card-activation.mjs","app/game-rules.mjs","app/page.tsx"];
const fold = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const sources = {};
for (const file of SOURCE_FILES) {
  try { sources[file] = (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).split(/\r?\n/); }
  catch { sources[file] = []; }
}
const findRefs = (needle, files = SOURCE_FILES, limit = 40) => {
  const wanted = fold(needle); const refs = [];
  if (!wanted) return refs;
  for (const file of files) for (let i = 0; i < (sources[file] || []).length; i += 1) {
    const line = sources[file][i];
    if (!fold(line).includes(wanted)) continue;
    refs.push({ file, line: i + 1, text: line.trim().slice(0, 600) });
    if (refs.length >= limit) return refs;
  }
  return refs;
};

const compiledCards = rawCards.map((raw) => compileCard(raw));
const allEffectTypes = [...new Set(compiledCards.flatMap((card) => (card.abilities || []).flatMap((ability) => ability.effects || []).map((effect) => effect.type).filter(Boolean)))].sort();
const handlerFiles = ["app/rules-engine/effects.mjs","app/rules-engine/engine.mjs","app/rules-engine/targeting.mjs","app/card-activation.mjs","app/page.tsx"];
const effectHandlers = Object.fromEntries(allEffectTypes.map((type) => [type, findRefs(type, handlerFiles, 20)]));

const cards = compiledCards.map((compiled, index) => {
  const abilities = compiled.abilities || [];
  const effects = abilities.flatMap((ability) => ability.effects || []);
  const costs = abilities.flatMap((ability) => ability.costs || []);
  const directRuntimeReferences = [...findRefs(compiled.name, SOURCE_FILES, 60), ...findRefs(compiled.id, SOURCE_FILES, 20)]
    .filter((ref, pos, arr) => arr.findIndex((other) => other.file === ref.file && other.line === ref.line) === pos);
  return {
    page: compiled.page,
    id: compiled.id,
    name: compiled.name,
    implementationSource: compiled.diagnostics?.ignored ? "ignored" : compiled.diagnostics?.source || "unknown",
    executable: compiled.diagnostics?.ignored ? false : canExecuteCard(compiled),
    unsupported: compiled.diagnostics?.unsupported || 0,
    ignoredReason: compiled.rules?.reason || null,
    triggers: [...new Set(abilities.map((ability) => ability.trigger).filter(Boolean))],
    effectTypes: [...new Set(effects.map((effect) => effect.type).filter(Boolean))],
    costTypes: [...new Set(costs.map((cost) => cost.type).filter(Boolean))],
    raw: rawCards[index],
    compiled,
    directRuntimeReferences,
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  sourceBranch: process.env.GITHUB_REF_NAME || "fix/cards_mechanics",
  sourceCommit: process.env.GITHUB_SHA || null,
  totalCards: cards.length,
  activeCards: cards.filter((card) => card.implementationSource !== "ignored").length,
  ignoredCards: cards.filter((card) => card.implementationSource === "ignored").length,
  explicitCards: cards.filter((card) => card.implementationSource === "explicit").length,
  textParsedCards: cards.filter((card) => card.implementationSource === "text").length,
  executableCards: cards.filter((card) => card.executable).length,
  unsupportedCards: cards.filter((card) => card.unsupported > 0).length,
  uniqueEffectTypes: allEffectTypes.length,
  scannedRuntimeFiles: SOURCE_FILES,
};

const output = { schema: "hemsfell-card-implementation-deep-audit/v1", summary, effectHandlers, cards };
await writeFile(new URL("../docs/card-implementation-deep-audit.json", import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify(summary, null, 2));

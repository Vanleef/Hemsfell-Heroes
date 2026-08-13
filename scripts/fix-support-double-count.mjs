import { readFile, writeFile } from "node:fs/promises";

const path = "app/rules-engine/engine.mjs";
let source = await readFile(path, "utf8");
const before = `  for (const source of permanentUnits(entry)) {\n    if (source === unit || source.suffocated || Math.abs((source.slot ?? -10) - (unit.slot ?? 10)) !== 1) continue;\n    const rulesText = [...activeKeywords(source), source.text || ""].join(" ");`;
const after = `  for (const source of entry.board || []) {\n    if (source === unit || source.suffocated || Math.abs((source.slot ?? -10) - (unit.slot ?? 10)) !== 1) continue;\n    if ((source.staticModifiers || []).some((modifier) => modifier.type === "supportAura" && (modifier.attack || modifier.health))) continue;\n    const rulesText = [...activeKeywords(source), source.text || ""].join(" ");`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error("Support fallback anchor not found");
  source = source.replace(before, after);
  await writeFile(path, source);
}
console.log("Support numeric fallback no longer double-counts compiled auras.");
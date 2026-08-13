import { readFile, writeFile } from "node:fs/promises";

const path = "app/rules-engine/engine.mjs";
let source = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");

const canonical = 'source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId:source.uid||source.id});';
const staleVariants = [
  'source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId});',
  'source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId||source.id});',
  'source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId:sourceId||source.id});',
];

for (const stale of staleVariants) source = source.replaceAll(stale, canonical);

// Defensive fallback for the exact optional-sacrifice modifier even if whitespace changes.
source = source.replace(
  /source\.modifiers\.push\(\{attack:ids\.length\*\(decision\.effect\.attackPerCreature\|\|2\),health:0,duration:"permanent",sourceId(?:\s*:\s*sourceId)?\s*\|\|\s*source\.id\}\);/g,
  canonical,
);

if (!source.includes(canonical)) throw new Error("sourceId repair target was not found");
if (/duration:"permanent",sourceId\s*(?:\}|\|\||:\s*sourceId)/.test(source)) {
  throw new Error("dangling or malformed sourceId remains after v22 repair");
}

await writeFile(path, source);
console.log("v22 applied: optional-sacrifice-buff uses sourceId: source.uid || source.id");

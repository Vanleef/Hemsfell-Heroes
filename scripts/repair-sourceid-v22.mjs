import { readFile, writeFile } from "node:fs/promises";

const path = "app/rules-engine/engine.mjs";
let source = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const before = 'source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId});';
const after = 'source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId:source.uid||source.id});';
if (source.includes(before)) source = source.replace(before, after);
if (!source.includes(after)) throw new Error("sourceId repair target was not found or repaired");
if (source.includes(before)) throw new Error("dangling sourceId still present after repair");
await writeFile(path, source);
console.log("v22 applied: optional-sacrifice-buff sourceId is scoped to its source card");

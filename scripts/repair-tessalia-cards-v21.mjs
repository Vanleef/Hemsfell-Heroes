import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");

let engine = await read("app/rules-engine/engine.mjs");
engine = engine.replace(
  'source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId});',
  'source.modifiers.push({attack:ids.length*(decision.effect.attackPerCreature||2),health:0,duration:"permanent",sourceId:source.uid||source.id});'
);
engine = engine.replaceAll(
  'const accelerated = (card.tags || []).some((tag) => /acelerado/i.test(tag)) || /acelerado/i.test(card.text || "");',
  'const accelerated = card.type === "Feitiço" && ((card.tags || []).some((tag) => /acelerado/i.test(tag)) || /^\\s*acelerado\\b/i.test(card.text || ""));'
);
await writeFile("app/rules-engine/engine.mjs", engine);

let page = await read("app/page.tsx");
page = page.replace(
  'const isFast=(c:CardDef)=>c.tags.includes("Acelerado")||/instantâneo|instantaneo/i.test(c.text);',
  'const isFast=(c:CardDef)=>c.type==="Feitiço"&&(c.tags.includes("Acelerado")||/^\\s*Acelerado\\b/i.test(c.text)||/instantâneo|instantaneo/i.test(c.text));'
);
await writeFile("app/page.tsx", page);

const cards = JSON.parse(await read("app/cards.generated.json"));
const correntes = cards.find((card) => card.page === 154);
if (!correntes) throw new Error("Correntes Purificadoras not found");
correntes.type = "Artefato";
correntes.tags = (correntes.tags || []).filter((tag) => !/acelerado/i.test(String(tag)));
correntes.text = "Toda vez que a criatura equipada for alvo de um efeito de outra criatura, Feitiço ou Feitiço Acelerado, você compra uma carta. Se Correntes Purificadoras seria enviada ao Cemitério, bana-a.";
await writeFile("app/cards.generated.json", JSON.stringify(cards, null, 2) + "\n");

const rules = await read("app/rules-engine/card-rules.mjs");
if (!rules.includes('p165: [ability("onDamageTaken", [effect("modifyStats", { attack: 1, health: 0, duration: "permanent", target: "self" })], [], { condition: { sourceSurvived: true } })]')) throw new Error("Escudeiro Cruel rule mismatch");

console.log("v21 applied");

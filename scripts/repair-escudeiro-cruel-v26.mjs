import { readFile, writeFile } from "node:fs/promises";

const path = "app/rules-engine/engine.mjs";
let source = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");

const activeNeedle = 'for (const ability of source.abilities || []) if (ability.trigger === event.type && eventAppliesToSource(event, source, owner) && conditionMatches(state, source, owner, ability.condition, event) && usageAvailable(state, source, owner, ability)) result.push({ source, owner, ability });';
const activeReplacement = 'for (const ability of source.abilities || []) if (!(source.page === 165 && event.type === "onDamageTaken" && ability.trigger === "onDamageTaken") && ability.trigger === event.type && eventAppliesToSource(event, source, owner) && conditionMatches(state, source, owner, ability.condition, event) && usageAvailable(state, source, owner, ability)) result.push({ source, owner, ability });';
if (!source.includes(activeReplacement)) {
  if (!source.includes(activeNeedle)) throw new Error("v26 activeAbilities patch point not found");
  source = source.replace(activeNeedle, activeReplacement);
}

const eventNeedle = '    } else if (item.kind === "event") {\n      const triggered = activeAbilities(state, item.event);';
const eventReplacement = '    } else if (item.kind === "event") {\n      if (item.event.type === "onDamageTaken" && item.event.amount > 0) {\n        const targetOwner = unitOwner(state, item.event.targetId);\n        const target = targetOwner >= 0 ? state.players[targetOwner].board.find((card) => (card.uid || card.id) === item.event.targetId) : null;\n        if (target?.page === 165) {\n          target.modifiers ||= [];\n          target.modifiers.push({ attack: 1, health: 0, duration: "permanent", sourceId: target.uid || target.id });\n        }\n      }\n      const triggered = activeAbilities(state, item.event);';
if (!source.includes(eventReplacement)) {
  if (!source.includes(eventNeedle)) throw new Error("v26 event patch point not found");
  source = source.replace(eventNeedle, eventReplacement);
}

await writeFile(path, source);
console.log("v26 applied: Escudeiro Cruel gains +1 attack whenever it survives positive damage");

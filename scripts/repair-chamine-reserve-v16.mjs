import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const write = (path, value) => writeFile(path, value);
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
};

// Chaminé, o Mafioso (p36): preserve the Fura-Fila ability exactly as-is.
// The enter effect returns one Suborno from grave to hand, or silently does
// nothing when no Suborno exists.
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);
  const before = 'p36: [ability("onEnter", [effect("retrieve", { zone: "grave", name: "Suborno", destination: "hand", optional: true })]), ability("onPlay", [effect("grantUntilTurnEnd", { ability: ability("onDestroyed", [effect("returnSelfToHand")]) })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],';
  const after = 'p36: [ability("onEnter", [effect("returnNamedFromGraveToHand", { name: "Suborno" })]), ability("onPlay", [effect("grantUntilTurnEnd", { ability: ability("onDestroyed", [effect("returnSelfToHand")]) })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],';
  source = replaceOnce(source, before, after, "Chaminé p36 enter effect");
  await write(path, source);
}

// Deterministic grave-to-hand primitive: return exactly one matching card; if
// none exists, ignore the effect without opening a decision or failing play.
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  if (!source.includes('returnNamedFromGraveToHand(state, effect, context)')) {
    const marker = '  conditionalDrawByControlledSubtype(state, effect, context) {';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Patch point not found: effects handler insertion");
    const handler = `  returnNamedFromGraveToHand(state, effect, context) {\n    const entry = player(state, context.owner);\n    const index = entry.grave.findIndex((card) => normalizedName(card.name) === normalizedName(effect.name));\n    if (index < 0) return;\n    entry.hand.push(entry.grave.splice(index, 1)[0]);\n  },\n`;
    source = source.slice(0, index) + handler + source.slice(index);
  }
  await write(path, source);
}

// Payment order: cards you play that are not creatures spend reserve first,
// then main energy. Creatures continue paying from main energy. Accelerated
// opponent-turn payment was already reserve-first and remains unchanged.
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);
  const before = 'else { const fromEnergy = Math.min(entry.energy, cost); entry.energy -= fromEnergy; const fromReserve = canUseReserve ? cost - fromEnergy : 0; entry.reserve -= fromReserve; }';
  const after = 'else if (canUseReserve) { const fromReserve = Math.min(entry.reserve, cost); entry.reserve -= fromReserve; entry.energy -= cost - fromReserve; } else { entry.energy -= cost; }';
  source = replaceOnce(source, before, after, "non-creature reserve-first payment");
  await write(path, source);
}

console.log("v16 applied: Chaminé returns Suborno without changing Fura-Fila; non-creatures spend reserve before main energy.");

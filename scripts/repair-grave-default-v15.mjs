import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const read = async (path) => normalize(await readFile(path, "utf8"));
const write = async (path, value) => writeFile(path, normalize(value));
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
};

// Preserve a printed/base snapshot whenever a card becomes a permanent. This
// lets the graveyard restore even fields that some effects mutate directly.
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);
  source = replaceOnce(
    source,
    'const unit = { ...card, uid:',
    'const unit = { ...card, _printedState: card._printedState ? structuredClone(card._printedState) : { name: card.name, type: card.type, cost: card.cost, atk: card.atk, hp: card.hp, text: card.text, tags: structuredClone(card.tags || []), subtypes: structuredClone(card.subtypes || []), abilities: structuredClone(card.abilities || []), page: card.page, id: card.id, image: card.image, hero: card.hero, imageCard: card.imageCard, generatedImage: card.generatedImage }, uid:',
    "permanent printed snapshot"
  );
  await write(path, source);
}

// Hidden-zone cleanup restores the printed snapshot before deleting runtime
// state. _printedState itself is retained as internal metadata so a resurrected
// card can be modified, die again, and still reset to the same printed values.
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  source = replaceOnce(
    source,
    'const cleanCardForHiddenZone = (card, metadata = {}) => {\n  const copy = { ...card, ...metadata };',
    'const cleanCardForHiddenZone = (card, metadata = {}) => {\n  const printed = card?._printedState ? structuredClone(card._printedState) : null;\n  const copy = { ...card, ...(printed || {}), ...metadata };',
    "restore printed state before hidden-zone cleanup"
  );
  await write(path, source);
}

console.log("v15 applied: permanents preserve printed snapshots and graveyard entries restore base card state.");

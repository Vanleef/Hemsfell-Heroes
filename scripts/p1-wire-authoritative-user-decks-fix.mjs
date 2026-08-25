import { readFile, writeFile } from "node:fs/promises";

const path = "app/api/rooms/initial-game.ts";
let source = await readFile(path, "utf8");
if (!source.includes("const cards = (rawCards as Card[])")) {
  const marker = "type DeckId = keyof typeof deckRanges;\n\n";
  if (!source.includes(marker)) throw new Error("DeckId marker missing after migration");
  source = source.replace(marker, `${marker}const cards = (rawCards as Card[])\n  .filter((card) => !removedCatalogPages.has(card.page))\n  .map((card) => compileCard(card.page === 252\n    ? { ...card, type: "Feitiço", tags: [...new Set([...(card.tags || []), "Acelerado"])] }\n    : card) as Card);\n\n`);
}
await writeFile(path, source);

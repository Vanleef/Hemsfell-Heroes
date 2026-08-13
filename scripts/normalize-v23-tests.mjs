import { readFile, writeFile } from "node:fs/promises";

const path = "tests/rules-engine.test.mjs";
let source = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const replacements = [
  ['assert.deepEqual(game.players[0].grave.map((card) => card.uid).sort(), ["artifact", "unit"]);', 'assert.deepEqual(game.players[0].grave.map((card) => card.id).sort(), ["artifact", "unit"]);'],
  ['assert.equal(terrainGame.players[1].grave[0].uid, "terrain");', 'assert.equal(terrainGame.players[1].grave[0].id, "terrain");'],
  ['assert.equal(game.players[0].hand[0].uid, "host");', 'assert.equal(game.players[0].hand[0].id, "host");'],
  ['assert.match(page, /Resposta: Full Control/);', 'assert.match(page, /Resposta: Manual/);'],
];
for (const [before, after] of replacements) {
  if (source.includes(before)) source = source.replace(before, after);
}
await writeFile(path, source);
console.log("v23 normalized stale zone identity and priority-label assertions");

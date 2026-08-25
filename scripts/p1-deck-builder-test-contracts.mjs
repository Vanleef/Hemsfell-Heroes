import { readFile, writeFile } from "node:fs/promises";

async function patch(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const [before, after, label] of replacements) {
    if (!source.includes(before)) throw new Error(`Patch point not found in ${path}: ${label}`);
    source = source.replace(before, after);
  }
  await writeFile(path, source);
}

await patch("tests/card-preview-collection-quality.test.mjs", [[
  "  assert.match(page, /mainDeckCopies===49/);\n",
  "  assert.match(page, /validateUserDeck\\(activeUserDeck,cards\\)/);\n  assert.match(page, /mainDeckCopies=deckValidation\\.mainCount/);\n  assert.match(page, /MAIN_DECK_SIZE/);\n",
  "deck validation now follows the shared model",
]]);

await patch("tests/graveyard-collection-priority-ui.test.mjs", [[
  "  assert.match(page, /collectionQuantity:quantity/);\n",
  "  assert.match(page, /collectionQuantity:entry\\.quantity/);\n  assert.match(page, /activeUserDeck\\.main\\.map/);\n",
  "collection copy counts now come from persisted user deck entries",
]]);

await patch("tests/online-join-idempotency.test.mjs", [[
  "  assert.match(page,/await roomAction\\(\"select\",\\{heroId,locked:true,selectRequestId\\}\\)/);\n",
  "  assert.match(page,/validateUserDeck\\(candidate,cards\\)/);\n  assert.match(page,/await roomAction\\(\"select\",\\{heroId,userDeck:validation\\.deck,locked:true,selectRequestId\\}\\)/);\n",
  "serialized select command now carries the validated private deck",
]]);

await patch("tests/rasmus-coffee-priority-regressions.test.mjs", [
  [
    'import { explicitCardRules } from "../app/rules-engine/card-rules.mjs";\n',
    'import { explicitCardRules } from "../app/rules-engine/card-rules.mjs";\nimport { suppliedDeckPages } from "../app/user-deck.mjs";\n',
    "Rasmus deck source import",
  ],
  [
    'test("Rasmus supplied deck matches the author list and totals exactly 49 cards", () => {\n  const match = pageSource.match(/rasmus:\\[(.*?)\\],\\n ngoro:/s);\n  assert.ok(match, "Rasmus supplied deck must exist");\n  const pairs = [...match[1].matchAll(/\\[(\\d+),(\\d+)\\]/g)].map((entry) => [Number(entry[1]), Number(entry[2])]);\n  const expected = [[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[234,3],[254,2],[212,1],[229,3],[251,2],[235,2]];\n  assert.deepEqual(pairs, expected);\n  assert.equal(pairs.reduce((sum, [, quantity]) => sum + quantity, 0), 49);\n});',
    'test("Rasmus supplied deck matches the author list and totals exactly 49 cards", () => {\n  const pairs = suppliedDeckPages.rasmus;\n  assert.ok(pairs, "Rasmus supplied deck must exist");\n  const expected = [[221,3],[245,3],[244,2],[217,3],[215,3],[246,3],[247,3],[216,3],[214,2],[250,2],[225,3],[249,3],[252,3],[234,3],[254,2],[212,1],[229,3],[251,2],[235,2]];\n  assert.deepEqual(pairs, expected);\n  assert.equal(pairs.reduce((sum, [, quantity]) => sum + quantity, 0), 49);\n});',
    "Rasmus deck audit reads canonical shared source",
  ],
]);

await writeFile("tests/rasmus-deck-no-images.test.mjs", `import assert from "node:assert/strict";\nimport test from "node:test";\nimport cards from "../app/cards.generated.json" with { type: "json" };\nimport { suppliedDeckPages } from "../app/user-deck.mjs";\n\ntest("Rasmus supplied deck contains 49 real cards and zero Images",()=>{\n  const pairs=suppliedDeckPages.rasmus;\n  assert.ok(pairs,"Rasmus supplied deck must exist");\n  assert.equal(pairs.reduce((sum,[,qty])=>sum+qty,0),49);\n  for(const [page] of pairs){\n    const card=cards.find(item=>item.page===page);\n    assert.ok(card,\`missing page \${page}\`);\n    assert.equal(card.imageCard,false,\`\${card.name} (p\${page}) must not be an Image in Rasmus main deck\`);\n  }\n  assert.ok(pairs.some(([page])=>page===234));\n  assert.ok(!pairs.some(([page])=>page===230));\n});\n`);

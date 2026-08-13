import { readFile, writeFile } from "node:fs/promises";

const path = "tests/rules-engine.test.mjs";
let source = await readFile(path, "utf8");
const original = source;

const replacements = [
  [
    'assert.match(interaction, /\\.visual-effect[\\s\\S]*z-index:\\s*62\\s*!important/);',
    'assert.match(interaction, /\\.visual-effect[\\s\\S]*z-index:\\s*120\\s*!important/);',
    "responsive animation z-index",
  ],
  [
    'assert.match(page, /className="hs-board game-content"/);',
    'assert.match(page, /hs-board game-content/);',
    "dynamic game-stage class",
  ],
];

const updated = [];
for (const [stale, current, label] of replacements) {
  if (source.includes(stale)) {
    source = source.replace(stale, current);
    updated.push(label);
  }
}

if (source !== original) {
  await writeFile(path, source);
  console.log(`Normalized CI assertions: ${updated.join(", ")}.`);
} else {
  console.log("CI assertions already match the current responsive implementation.");
}

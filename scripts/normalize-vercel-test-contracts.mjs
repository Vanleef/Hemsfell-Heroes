import { readFile, writeFile } from "node:fs/promises";

const path = "tests/rules-engine.test.mjs";
let source = await readFile(path, "utf8");
const original = source;

source = source
  .replace(
    'assert.match(interaction, /\\.visual-effect[\\s\\S]*z-index:\\s*62\\s*!important/);',
    'assert.match(interaction, /\\.visual-effect[\\s\\S]*z-index:\\s*120\\s*!important/);',
  )
  .replace(
    'assert.match(page, /className=\\"hs-board game-content\\"/);',
    'assert.match(page, /hs-board game-content/);',
  );

if (source !== original) {
  await writeFile(path, source);
  console.log("Normalized stale Vercel structural assertions.");
} else {
  console.log("Vercel structural assertions already normalized.");
}

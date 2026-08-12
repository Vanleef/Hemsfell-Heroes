import { readFile, writeFile } from "node:fs/promises";

const path = "tests/rules-engine.test.mjs";
const source = await readFile(path, "utf8");
const stale = 'assert.match(interaction, /\\.visual-effect[\\s\\S]*z-index:\\s*62\\s*!important/);';
const current = 'assert.match(interaction, /\\.visual-effect[\\s\\S]*z-index:\\s*120\\s*!important/);';

if (source.includes(current)) {
  console.log("Responsive animation layer assertion already current.");
} else if (source.includes(stale)) {
  await writeFile(path, source.replace(stale, current));
  console.log("Updated stale responsive animation layer assertion for CI.");
} else {
  console.log("Responsive animation layer assertion not found; no CI normalization needed.");
}

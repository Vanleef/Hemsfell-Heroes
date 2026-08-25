import { readFile, writeFile } from "node:fs/promises";

const path = "tests/rules-engine.test.mjs";
let source = await readFile(path, "utf8");
const oldAssertion = '  assert.match(page, /canEvolveThisTurn=\\{game\\.active===0\\}/);';
const newAssertion = '  assert.match(page, /canEvolveThisTurn=\\{game\\.active===0&&!onlineCommandPending\\}/);';
if (!source.includes(oldAssertion)) {
  if (!source.includes(newAssertion)) throw new Error("hero evolution interaction assertion patch point missing");
} else {
  source = source.replace(oldAssertion, newAssertion);
}
await writeFile(path, source);

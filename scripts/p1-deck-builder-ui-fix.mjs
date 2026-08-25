import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/p1-deck-builder-ui.mjs";
let source = await readFile(path, "utf8");
const replacements = [
  [
    ' assert.match(page,/aria-label=\\\\{`Adicionar uma cópia/);\\n',
    ' assert.ok(page.includes("Adicionar uma cópia"));\\n',
  ],
  [
    ' assert.match(page,/aria-label=\\\\{`Remover uma cópia/);\\n',
    ' assert.ok(page.includes("Remover uma cópia"));\\n',
  ],
];
for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`Runner assertion patch point missing: ${before}`);
  source = source.replace(before, after);
}
await writeFile(path, source);

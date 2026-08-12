import { readFile, writeFile } from "node:fs/promises";

/*
 * Git may materialize the working tree with CRLF on Windows. Several historical
 * migration scripts intentionally match structural source blocks, so normalize
 * only their input files to LF immediately before those migrations run.
 *
 * This is safe for Git/Node/Next and makes `npm run rules:migrate` deterministic
 * across Windows, macOS, Linux, CI and Vercel.
 */
const files = [
  "app/rules-engine/compiler.mjs",
  "app/rules-engine/card-rules.mjs",
  "app/rules-engine/effects.mjs",
  "app/rules-engine/engine.mjs",
  "app/page.tsx",
  "app/lab.css",
];

let normalized = 0;
for (const path of files) {
  const source = await readFile(path, "utf8");
  const next = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (next !== source) {
    await writeFile(path, next, "utf8");
    normalized += 1;
  }
}

console.log(`Rules migration inputs normalized (${normalized} file(s) changed).`);

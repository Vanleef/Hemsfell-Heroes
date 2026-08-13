import { readFile, writeFile } from "node:fs/promises";

const path = "app/rules-engine/compiler.mjs";
let source = await readFile(path, "utf8");

const before = `  if (cursor < source.length) {
    const independent = clean(source.slice(cursor));
    if (independent) sections.push({ label: "", text: independent });
  }
`;

const after = `  if (cursor < source.length) {
    const independent = clean(source.slice(cursor));
    // A sentence such as "X é o número de cartas..." defines the dynamic
    // value used by the preceding Fura-Fila clause; it is metadata, not a
    // standalone ability. Treating it as another section creates an
    // unsupported phantom ability and makes an otherwise valid card fail
    // canExecuteCard().
    if (independent && !/^x\\s+(?:é|e)\\b/i.test(independent)) sections.push({ label: "", text: independent });
  }
`;

if (source.includes(after)) {
  console.log("Fura-Fila variable-definition fix already applied.");
} else if (source.includes(before)) {
  source = source.replace(before, after);
  await writeFile(path, source);
  console.log("Fura-Fila variable definitions are now treated as metadata.");
} else {
  throw new Error("Could not locate the trailing splitTriggeredSections block.");
}

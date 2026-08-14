import { access, readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const scriptsDir = new URL("./", import.meta.url);
const failures = [];
const notes = [];

const fail = (message) => failures.push(message);
const read = (path) => readFile(new URL(path, root), "utf8");

const requiredFiles = [
  "app/page.tsx",
  "app/cards.generated.json",
  "app/globals.css",
  "app/rules-engine/card-rules.mjs",
  "app/rules-engine/compiler.mjs",
  "app/rules-engine/effects.mjs",
  "app/rules-engine/engine.mjs",
  "tests/rules-engine.test.mjs",
];

for (const path of requiredFiles) {
  try { await access(new URL(path, root)); }
  catch { fail(`Required canonical file is missing: ${path}`); }
}

const packageJson = JSON.parse(await read("package.json"));
const scriptCommands = JSON.stringify(packageJson.scripts || {});
const forbiddenCommandRef = /scripts\/(?:apply-|repair-|fix-|normalize-|prepare-card|finalize-)[^\s"']*/g;
const forbiddenRefs = scriptCommands.match(forbiddenCommandRef) || [];
if (forbiddenRefs.length) fail(`package.json still invokes historical patch scripts: ${[...new Set(forbiddenRefs)].join(", ")}`);

const protectedLegacyReferences = new Set([
  "repair-runtime-ai-cost-v18.mjs",
  "repair-board-visual-polish-v20.mjs",
]);
const oneOffPatchPattern = /^(?:apply-|repair-|fix-|normalize-|prepare-card|finalize-).*\.(?:mjs|js)$/;
const scriptFiles = (await readdir(scriptsDir)).filter((name) => /\.(?:mjs|js|sh)$/.test(name));
const stalePatches = scriptFiles.filter((name) => oneOffPatchPattern.test(name) && !protectedLegacyReferences.has(name));
if (stalePatches.length) fail(`One-off patch scripts were reintroduced. Edit canonical app/rules/test files instead: ${stalePatches.join(", ")}`);

const cards = JSON.parse(await read("app/cards.generated.json"));
if (!Array.isArray(cards) || !cards.length) fail("app/cards.generated.json must contain the canonical card array.");
else {
  const duplicateIds = [...new Set(cards.map((card) => card.id).filter((id, index, all) => id && all.indexOf(id) !== index))];
  const duplicatePages = [...new Set(cards.map((card) => card.page).filter((page, index, all) => page != null && all.indexOf(page) !== index))];
  if (duplicateIds.length) fail(`Duplicate card ids: ${duplicateIds.join(", ")}`);
  if (duplicatePages.length) fail(`Duplicate card pages: ${duplicatePages.join(", ")}`);
  notes.push(`${cards.length} canonical cards loaded`);
}

const globals = await read("app/globals.css");
let sawCssRule = false;
for (const rawLine of globals.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("/*") || line.startsWith("*")) continue;
  if (line.startsWith("@import")) {
    if (sawCssRule) fail("app/globals.css contains an @import after regular CSS; imports must stay at the top.");
  } else sawCssRule = true;
}
for (const match of globals.matchAll(/@import\s+["'](\.\/[^"']+)["'];/g)) {
  const relative = match[1].slice(2);
  try { await access(new URL(`app/${relative}`, root)); }
  catch { fail(`globals.css imports a missing stylesheet: ${match[1]}`); }
}

for (const path of ["app/page.tsx", "app/rules-engine/effects.mjs", "app/rules-engine/engine.mjs"]) {
  const source = await read(path);
  if (/\.\.\.sourceId\b/.test(source)) fail(`${path} contains the malformed legacy ...sourceId shorthand.`);
}

notes.push(`${scriptFiles.length} executable maintenance/tool scripts remain`);
notes.push("runtime/build source is canonical; no source-mutating migration chain is executed");

if (failures.length) {
  console.error("Project maintenance checks failed:\n" + failures.map((item) => ` - ${item}`).join("\n"));
  process.exit(1);
}

console.log("Project maintenance checks passed.");
for (const note of notes) console.log(` - ${note}`);

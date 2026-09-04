import { access, readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const scriptsDir = new URL("./", import.meta.url);
const githubScriptsDir = new URL("../.github/scripts/", import.meta.url);
const workflowsDir = new URL("../.github/workflows/", import.meta.url);
const failures = [];
const notes = [];

const fail = (message) => failures.push(message);
const read = (path) => readFile(new URL(path, root), "utf8");
const list = async (url) => {
  try { return await readdir(url); }
  catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};
const assertOrdered = (source, tokens, label) => {
  let cursor = -1;
  for (const token of tokens) {
    const index = source.indexOf(token);
    if (index < 0) { fail(`${label} is missing ${token}`); continue; }
    if (index <= cursor) fail(`${label} changed required order around ${token}`);
    cursor = index;
  }
};

const requiredFiles = [
  "app/page.tsx",
  "app/data/catalog/cards.generated.json",
  "app/globals.css",
  "app/presentation/styles/match-ui.css",
  "app/presentation/styles/game-presentation.css",
  "app/presentation/styles/tutorial.css",
  "app/presentation/match/match-ui-runtime.tsx",
  "app/presentation/runtime/match-runtime-gate.tsx",
  "app/presentation/runtime/game-presentation-runtime.tsx",
  "app/presentation/match/match-ui-guard.tsx",
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

const oneOffPatchPattern = /^(?:apply-|repair-|fix-|normalize-|prepare-card|finalize-).*\.(?:mjs|js|py)$/i;
const scriptFiles = (await list(scriptsDir)).filter((name) => /\.(?:mjs|js|sh)$/.test(name));
const stalePatches = scriptFiles.filter((name) => oneOffPatchPattern.test(name));
if (stalePatches.length) fail(`One-off patch scripts were reintroduced under scripts/: ${stalePatches.join(", ")}`);

const githubPatchScripts = (await list(githubScriptsDir)).filter((name) => oneOffPatchPattern.test(name));
if (githubPatchScripts.length) fail(`One-off patch scripts were reintroduced under .github/scripts/: ${githubPatchScripts.join(", ")}`);

const historicalWorkflowPattern = /^(?:fix|repair|apply)-.*\.ya?ml$/i;
const workflowFiles = (await list(workflowsDir)).filter((name) => /\.ya?ml$/i.test(name));
const historicalWorkflows = workflowFiles.filter((name) => historicalWorkflowPattern.test(name));
if (historicalWorkflows.length) fail(`Historical source-mutating workflows were reintroduced: ${historicalWorkflows.join(", ")}`);

const cards = JSON.parse(await read("app/data/catalog/cards.generated.json"));
if (!Array.isArray(cards) || !cards.length) fail("app/data/catalog/cards.generated.json must contain the canonical card array.");
else {
  const duplicateIds = [...new Set(cards.map((card) => card.id).filter((id, index, all) => id && all.indexOf(id) !== index))];
  const duplicatePages = [...new Set(cards.map((card) => card.page).filter((page, index, all) => page != null && all.indexOf(page) !== index))];
  if (duplicateIds.length) fail(`Duplicate card ids: ${duplicateIds.join(", ")}`);
  if (duplicatePages.length) fail(`Duplicate card pages: ${duplicatePages.join(", ")}`);
  notes.push(`${cards.length} canonical cards loaded`);
}

async function validateCssImports(path) {
  const source = await read(path);
  const sourceUrl = new URL(path, root);
  let sawCssRule = false;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("/*") || line.startsWith("*") || line.startsWith("*/")) continue;
    if (line.startsWith("@import")) {
      if (sawCssRule) fail(`${path} contains an @import after regular CSS; imports must stay at the top.`);
    } else sawCssRule = true;
  }
  for (const match of source.matchAll(/@import\s+["'](\.\/[^"']+)["'];/g)) {
    try { await access(new URL(match[1], sourceUrl)); }
    catch { fail(`${path} imports a missing stylesheet: ${match[1]}`); }
  }
}

await validateCssImports("app/globals.css");
await validateCssImports("app/presentation/styles/match-ui.css");

const [labStructure, matchStructure, responseStructure, layoutStructure, matchRuntimeGate] = await Promise.all([
  read("app/presentation/styles/board/lab.css"),
  read("app/presentation/styles/match-ui.css"),
  read("app/presentation/styles/response-window.css"),
  read("app/layout.tsx"),
  read("app/presentation/runtime/match-runtime-gate.tsx"),
]);

assertOrdered(labStructure, [
  '@import "../legacy/lab-legacy.css";',
  '@import "./board-layout.css";',
  '@import "./board-tuning.css";',
  '@import "./lab-overrides.css";',
  '@import "./lab-interaction-responsive.css";',
], "app/presentation/styles/board/lab.css cascade");

assertOrdered(matchStructure, [
  '@import "./command-bar-fixes.css";',
  '@import "./match-ui-guard.css";',
  '@import "./response-window.css";',
  '@import "./card-list-scrollviews.css";',
  '@import "./card-list-grid-layout.css";',
  '@import "./card-list-grid-fit.css";',
  '@import "./decision-lane-position.css";',
  '@import "./target-banner-anchor.css";',
  '@import "./hero-inspector-fix.css";',
  '/* === HERO INSPECTOR CLEANUP === */',
  '/* === MATCH RESULT === */',
  '/* === MATCH LOG === */',
  '/* === COMBAT ATTACK HIGHLIGHT === */',
], "app/presentation/styles/match-ui.css cascade");

assertOrdered(responseStructure, [
  '/* === SETUP HEADING',
  '/* === RESPONSE WINDOW === */',
], "app/presentation/styles/response-window.css cascade");

assertOrdered(layoutStructure, [
  'import "./globals.css";',
  'import "./presentation/styles/match-ui.css";',
  'import "./presentation/styles/online-match-runtime.css";',
  'import MatchUiGuard from "./presentation/match/match-ui-guard";',
  'import MatchRuntimeGate from "./presentation/runtime/match-runtime-gate";',
  '<MatchUiGuard />',
  '<MatchRuntimeGate />',
], "app/layout.tsx runtime order");

assertOrdered(matchRuntimeGate, [
  'const MatchUiRuntime = dynamic(',
  'const PresentationEventBridge = dynamic(',
  '<MatchUiRuntime />',
  '<PresentationEventBridge />',
], "app/presentation/runtime/match-runtime-gate.tsx runtime order");

for (const path of ["app/page.tsx", "app/rules-engine/effects.mjs", "app/rules-engine/engine.mjs"]) {
  const source = await read(path);
  if (/\.\.\.sourceId\b/.test(source)) fail(`${path} contains the malformed legacy ...sourceId shorthand.`);
}

notes.push(`${scriptFiles.length} reusable executable scripts remain under scripts/`);
notes.push(`${workflowFiles.length} canonical GitHub workflow(s) remain`);
notes.push("runtime/build source and presentation cascade are canonical; no mirror or source-mutating patch chain is executed");

if (failures.length) {
  console.error("Project maintenance checks failed:\n" + failures.map((item) => ` - ${item}`).join("\n"));
  process.exit(1);
}

console.log("Project maintenance checks passed.");
for (const note of notes) console.log(` - ${note}`);

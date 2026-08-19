import { readFile, writeFile, rm } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const exists = async (path) => { try { await readFile(path); return true; } catch { return false; } };
const section = (label, source) => `\n\n/* === ${label} === */\n${source.trim()}\n`;

const matchSources = [
  ["MATCH COMMAND BAR", "app/command-bar-fixes.css"],
  ["MATCH UI GUARD", "app/match-ui-guard.css"],
  ["MATCH SETUP HEADING", "app/setup-heading-fixes.css"],
  ["MATCH RESPONSE WINDOW", "app/response-window.css"],
  ["MATCH CARD LIST SCROLLVIEWS", "app/card-list-scrollviews.css"],
  ["MATCH CARD LIST GRID LAYOUT", "app/card-list-grid-layout.css"],
  ["MATCH CARD LIST GRID FIT", "app/card-list-grid-fit.css"],
  ["MATCH DECISION LANE", "app/decision-lane-position.css"],
  ["MATCH TARGET BANNER", "app/target-banner-anchor.css"],
  ["MATCH HERO INSPECTOR", "app/hero-inspector-fix.css"],
  ["MATCH HERO INSPECTOR CLEANUP", "app/hero-inspector-cleanup.css"],
  ["MATCH RESULT", "app/match-result-enhancer.css"],
  ["MATCH LOG", "app/match-log.css"],
  ["MATCH COMBAT ATTACK HIGHLIGHT", "app/styles/match/combat-attack-highlight.css"],
  ["MATCH ONLINE RUNTIME", "app/online-match-runtime.css"],
];

const originalMatchEntry = await read("app/match-ui.css");
for (const [, path] of matchSources.slice(0, -1)) {
  const file = path.replace(/^app\//, "./");
  if (path.includes("styles/match/combat-attack-highlight.css")) {
    if (!originalMatchEntry.includes('@import "./styles/match/combat-attack-highlight.css";')) throw new Error("match-ui.css combat highlight import drifted");
  } else if (!originalMatchEntry.includes(`@import "${file}";`)) {
    throw new Error(`match-ui.css import drifted for ${path}`);
  }
}

let consolidatedMatch = `/*\n * Hemsfell Heroes — canonical match presentation layer.\n *\n * Consolidated without changing selector names, declaration values or the\n * historical cascade order. Section order is a compatibility contract.\n */\n`;
for (const [label, path] of matchSources) {
  const source = await read(path);
  if (/^\s*@import\b/m.test(source)) throw new Error(`${path} unexpectedly contains a nested @import`);
  consolidatedMatch += section(label, source);
}
await writeFile("app/match-ui.css", consolidatedMatch);

let layout = await read("app/layout.tsx");
if (!layout.includes('import "./online-match-runtime.css";')) throw new Error("layout online-match-runtime CSS import drifted");
layout = layout.replace('import "./online-match-runtime.css";\n', "");
await writeFile("app/layout.tsx", layout);

const rasmusPath = "tests/rasmus-hero-cat-regressions.test.mjs";
let rasmus = await read(rasmusPath);
if (!rasmus.includes("../app/hero-inspector-fix.css")) throw new Error("Rasmus inspector CSS regression path drifted");
rasmus = rasmus.replace("../app/hero-inspector-fix.css", "../app/match-ui.css");
await writeFile(rasmusPath, rasmus);

const maintenancePath = "scripts/project-maintenance.mjs";
let maintenance = await read(maintenancePath);
const insertionPoint = 'await validateCssImports("app/match-ui.css");';
if (!maintenance.includes(insertionPoint)) throw new Error("project-maintenance CSS validation anchor drifted");
const structureChecks = `\n\nconst assertOrdered = (source, tokens, label) => {\n  let cursor = -1;\n  for (const token of tokens) {\n    const index = source.indexOf(token);\n    if (index < 0) { fail(\`${'${label}'} is missing ${'${token}'}\`); continue; }\n    if (index <= cursor) fail(\`${'${label}'} changed required order around ${'${token}'}\`);\n    cursor = index;\n  }\n};\n\nconst [labStructure, matchStructure, layoutStructure] = await Promise.all([\n  read("app/lab.css"),\n  read("app/match-ui.css"),\n  read("app/layout.tsx"),\n]);\n\nassertOrdered(labStructure, [\n  '@import "./lab-legacy.css";',\n  '@import "./board-layout.css";',\n  '@import "./board-tuning.css";',\n  '@import "./lab-overrides.css";',\n  '@import "./lab-interaction-responsive.css";',\n], "app/lab.css cascade");\n\nassertOrdered(matchStructure, [\n  "/* === MATCH COMMAND BAR === */",\n  "/* === MATCH UI GUARD === */",\n  "/* === MATCH SETUP HEADING === */",\n  "/* === MATCH RESPONSE WINDOW === */",\n  "/* === MATCH CARD LIST SCROLLVIEWS === */",\n  "/* === MATCH CARD LIST GRID LAYOUT === */",\n  "/* === MATCH CARD LIST GRID FIT === */",\n  "/* === MATCH DECISION LANE === */",\n  "/* === MATCH TARGET BANNER === */",\n  "/* === MATCH HERO INSPECTOR === */",\n  "/* === MATCH HERO INSPECTOR CLEANUP === */",\n  "/* === MATCH RESULT === */",\n  "/* === MATCH LOG === */",\n  "/* === MATCH COMBAT ATTACK HIGHLIGHT === */",\n  "/* === MATCH ONLINE RUNTIME === */",\n], "app/match-ui.css cascade");\n\nassertOrdered(layoutStructure, [\n  'import "./globals.css";',\n  'import "./match-ui.css";',\n  'import MatchUiGuard from "./match-ui-guard";',\n  'import MatchUiRuntime from "./match-ui-runtime";',\n  '<MatchUiGuard />',\n  '<MatchUiRuntime />',\n], "app/layout.tsx runtime order");\nif (layoutStructure.includes('import "./online-match-runtime.css";')) fail("layout.tsx still imports the CSS already consolidated into match-ui.css");\n`;
maintenance = maintenance.replace(insertionPoint, insertionPoint + structureChecks);
await writeFile(maintenancePath, maintenance);

const packagePath = "package.json";
const packageJson = JSON.parse(await read(packagePath));
delete packageJson.scripts["verify:frontend-structure"];
packageJson.scripts["prepare:project"] = "node scripts/project-maintenance.mjs";
await writeFile(packagePath, JSON.stringify(packageJson, null, 2) + "\n");

const deletePaths = [
  ...matchSources.map(([, path]) => path),
  "scripts/verify-frontend-structure.mjs",
  "app/styles",
  "app/ui",
];
for (const path of deletePaths) {
  if (path === "app/match-ui.css") continue;
  if (await exists(path) || path === "app/styles" || path === "app/ui") await rm(path, { recursive: true, force: true });
}

console.log("Match presentation consolidation complete.");
console.log(`Merged ${matchSources.length} active CSS sources into app/match-ui.css.`);
console.log("Removed structural style mirrors, UI barrel-only facade, and standalone frontend verifier.");

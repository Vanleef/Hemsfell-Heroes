import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const failures = [];
const read = (path) => readFile(new URL(path, root), "utf8");
const assertOrdered = (source, tokens, label) => {
  let cursor = -1;
  for (const token of tokens) {
    const index = source.indexOf(token);
    if (index < 0) { failures.push(`${label} is missing ${token}`); continue; }
    if (index <= cursor) failures.push(`${label} changed required order around ${token}`);
    cursor = index;
  }
};

const [lab, matchUi, response, layout] = await Promise.all([
  read("app/lab.css"),
  read("app/match-ui.css"),
  read("app/response-window.css"),
  read("app/layout.tsx"),
]);

assertOrdered(lab, [
  '@import "./lab-legacy.css";',
  '@import "./board-layout.css";',
  '@import "./board-tuning.css";',
  '@import "./lab-overrides.css";',
  '@import "./lab-interaction-responsive.css";',
], "app/lab.css cascade");

assertOrdered(matchUi, [
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
], "app/match-ui.css cascade");

assertOrdered(response, [
  '/* === SETUP HEADING',
  '/* === RESPONSE WINDOW === */',
], "app/response-window.css cascade");

assertOrdered(layout, [
  'import "./globals.css";',
  'import "./match-ui.css";',
  'import "./online-match-runtime.css";',
  'import MatchUiGuard from "./match-ui-guard";',
  'import MatchUiRuntime from "./match-ui-runtime";',
  '<MatchUiGuard />',
  '<MatchUiRuntime />',
], "app/layout.tsx runtime order");

if (failures.length) {
  console.error("Frontend structure verification failed:\n" + failures.map((message) => ` - ${message}`).join("\n"));
  process.exit(1);
}

console.log("Frontend structure verification passed: canonical runtime/cascade order is preserved without mirror or terminal patch files.");

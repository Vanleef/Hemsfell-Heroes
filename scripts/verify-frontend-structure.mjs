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

const [lab, matchUi, layout] = await Promise.all([
  read("app/lab.css"),
  read("app/match-ui.css"),
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
  '@import "./setup-heading-fixes.css";',
  '@import "./response-window.css";',
  '@import "./card-list-scrollviews.css";',
  '@import "./card-list-grid-layout.css";',
  '@import "./card-list-grid-fit.css";',
  '@import "./decision-lane-position.css";',
  '@import "./target-banner-anchor.css";',
  '@import "./hero-inspector-fix.css";',
  '@import "./hero-inspector-cleanup.css";',
  '@import "./match-result-enhancer.css";',
  '@import "./match-log.css";',
  '@import "./styles/match/combat-attack-highlight.css";',
], "app/match-ui.css cascade");

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

console.log("Frontend structure verification passed: canonical runtime/cascade order is unchanged and no mirror tree is required.");

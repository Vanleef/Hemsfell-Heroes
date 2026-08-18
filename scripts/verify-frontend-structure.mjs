import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => readFile(new URL(path, root), "utf8");

const stylesheetMirrors = [
  ["app/lab-legacy.css", "app/styles/board/lab-legacy.css"],
  ["app/board-layout.css", "app/styles/board/board-layout.css"],
  ["app/board-tuning.css", "app/styles/board/board-tuning.css"],
  ["app/lab-overrides.css", "app/styles/board/lab-overrides.css"],
  ["app/lab-interaction-responsive.css", "app/styles/board/lab-interaction-responsive.css"],
  ["app/command-bar-fixes.css", "app/styles/match/command-bar-fixes.css"],
  ["app/match-ui-guard.css", "app/styles/match/match-ui-guard.css"],
  ["app/setup-heading-fixes.css", "app/styles/match/setup-heading-fixes.css"],
  ["app/response-window.css", "app/styles/match/response-window.css"],
  ["app/card-list-scrollviews.css", "app/styles/match/card-list-scrollviews.css"],
  ["app/card-list-grid-layout.css", "app/styles/match/card-list-grid-layout.css"],
  ["app/card-list-grid-fit.css", "app/styles/match/card-list-grid-fit.css"],
  ["app/decision-lane-position.css", "app/styles/match/decision-lane-position.css"],
  ["app/target-banner-anchor.css", "app/styles/match/target-banner-anchor.css"],
  ["app/hero-inspector-fix.css", "app/styles/match/hero-inspector-fix.css"],
  ["app/hero-inspector-cleanup.css", "app/styles/match/hero-inspector-cleanup.css"],
  ["app/match-result-enhancer.css", "app/styles/match/match-result-enhancer.css"],
  ["app/match-log.css", "app/styles/match/match-log.css"],
];

for (const [compatibilityPath, organizedPath] of stylesheetMirrors) {
  const [compatibilitySource, organizedSource] = await Promise.all([read(compatibilityPath), read(organizedPath)]);
  if (compatibilitySource !== organizedSource) fail(`${organizedPath} drifted from compatibility source ${compatibilityPath}`);
}

const assertOrdered = (source, tokens, label) => {
  let cursor = -1;
  for (const token of tokens) {
    const index = source.indexOf(token);
    if (index < 0) { fail(`${label} is missing ${token}`); continue; }
    if (index <= cursor) fail(`${label} changed required order around ${token}`);
    cursor = index;
  }
};

const [lab, matchUi, layout, runtimeIndex] = await Promise.all([
  read("app/lab.css"),
  read("app/match-ui.css"),
  read("app/layout.tsx"),
  read("app/ui/runtime/index.ts"),
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
], "app/match-ui.css cascade");

assertOrdered(layout, [
  'import "./globals.css";',
  'import "./match-ui.css";',
  'import MatchUiGuard from "./match-ui-guard";',
  'import MatchUiRuntime from "./match-ui-runtime";',
  '<MatchUiGuard />',
  '<MatchUiRuntime />',
], "app/layout.tsx runtime order");

assertOrdered(runtimeIndex, [
  'import MatchUiGuard from "../../match-ui-guard";',
  'import MatchUiRuntime from "../../match-ui-runtime";',
], "app/ui/runtime dependency order");

if (failures.length) {
  console.error("Frontend structure verification failed:\n" + failures.map((message) => ` - ${message}`).join("\n"));
  process.exit(1);
}

console.log(`Frontend structure verification passed: ${stylesheetMirrors.length} stylesheet mirrors are byte-identical and runtime/cascade order is unchanged.`);

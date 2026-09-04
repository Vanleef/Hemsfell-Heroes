import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/match-interaction-terminal.css", "utf8");
const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("terminal interaction layer loads before side-pile and scoped terminal authorities", () => {
  const cssImports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  const interactionIndex = cssImports.indexOf("./presentation/styles/match-interaction-terminal.css");
  const sidePileTerminalIndex = cssImports.indexOf("./presentation/styles/side-pile-text-shadow-terminal.css");
  const handTerminalIndex = cssImports.indexOf("./presentation/styles/hand-ai-ui-terminal.css");
  const tutorialTerminalIndex = cssImports.indexOf("./presentation/styles/tutorial-current-ui-terminal.css");
  assert.ok(interactionIndex >= 0);
  assert.ok(sidePileTerminalIndex > interactionIndex);
  assert.ok(handTerminalIndex > sidePileTerminalIndex);
  assert.ok(tutorialTerminalIndex > handTerminalIndex);
  assert.equal(cssImports.at(-1), "./presentation/styles/tutorial-current-ui-terminal.css");
});

test("stack and AI share the measured central band above every board layer", () => {
  assert.match(css, /--hh-priority-band-x/);
  assert.match(css, /--hh-priority-band-y/);
  assert.match(sheet, /priority-stack-indicator,[^{]*response-waiting,[^{]*\[data-hemsfell-ai-thinking\][^}]*position: fixed !important[^}]*top: var\(--hh-priority-band-y, 50vh\) !important[^}]*z-index: 2147482500 !important/);
  assert.match(sheet, /priority-stack-indicator[^}]*left: var\(--hh-priority-band-x, 50vw\) !important/);
  assert.match(sheet, /\[data-hemsfell-ai-thinking\][^}]*left: var\(--hh-priority-band-x, 50vw\) !important/);
  assert.match(css, /body:has\(\[data-hemsfell-ai-thinking\]\)[\s\S]*?priority-stack-indicator/);
  assert.match(css, /body:has\(\.screen-game \.priority-stack-indicator\)[\s\S]*?\[data-hemsfell-ai-thinking\]/);
});

test("PILHA and its count are intentionally larger", () => {
  assert.match(sheet, /priority-stack-indicator > span[^}]*font-size: clamp\(\.7rem, min\(\.98cqw, 1\.46cqh\), 1rem\) !important/);
  assert.match(sheet, /priority-stack-indicator > b[^}]*font-size: clamp\(\.82rem, min\(1\.15cqw, 1\.72cqh\), 1\.18rem\) !important/);
  assert.match(sheet, /priority-stack-indicator > b[^}]*border-radius: 50% !important/);
});

test("hero level-up feedback cannot scale the real panel or overlay", () => {
  assert.match(sheet, /\.hh-hero-level-up,[^{]*hero-level-transition,[^{]*hero-level-transition > \.player-hero[^}]*transform: none !important[^}]*scale: 1 !important[^}]*zoom: 1 !important/);
});

test("hover raises only an individual field slot never the whole row", () => {
  assert.match(sheet, /paired-field:hover,[^{]*paired-field:focus-within,[^{]*paired-field:has\(\.card-frame:hover\)[^}]*z-index: 40 !important[^}]*isolation: isolate !important/);
  assert.match(sheet, /field-column:hover,[^{]*field-column:focus-within,[^{]*field-column:has\(\.card-frame:hover\)[^}]*z-index: 1 !important[^}]*isolation: isolate !important/);
  assert.match(sheet, /field-slot:hover,[^{]*field-slot:focus-within,[^{]*field-slot:has\(\.card-frame:hover\)[^}]*z-index: 2 !important/);
});

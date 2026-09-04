import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/presentation/styles/priority-card-anchor-terminal.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("stack and AI occupy opposite sides of the measured priority lane", () => {
  assert.match(css, /body:has\(\.screen-game \.priority-stack-indicator\):has\(\[data-hemsfell-ai-thinking\]\)[\s\S]*?priority-stack-indicator[\s\S]*?left:\s*calc\(var\(--hh-priority-band-x,[^)]+\) - var\(--hh-priority-pair-gap,[^)]+\)\)[^}]*transform:\s*translate\(-100%, -50%\)/);
  assert.match(css, /body:has\(\.screen-game \.priority-stack-indicator\):has\(\[data-hemsfell-ai-thinking\]\)[\s\S]*?\[data-hemsfell-ai-thinking\][\s\S]*?left:\s*calc\(var\(--hh-priority-band-x,[^)]+\) \+ var\(--hh-priority-pair-gap,[^)]+\)\)[^}]*transform:\s*translate\(0, -50%\)/);
});

test("battlefield selection never moves the card face away from its icon rails", () => {
  assert.match(css, /paired-field \.field-slot > \.card-frame > \.original-card\.is-selected[\s\S]*?transform:\s*none !important/);
  assert.match(css, /\.card-frame\[data-unit-id\] > \.field-negative-statuses[\s\S]*?left:\s*calc\(0px - var\(--keyword-icon-size/);
  assert.match(css, /\.card-frame\[data-unit-id\] > \.field-keywords[\s\S]*?right:\s*calc\(0px - var\(--keyword-icon-size/);
  assert.match(css, /\.card-frame\[data-unit-id\] > \.card-frame-activation[\s\S]*?left:\s*50% !important[\s\S]*?translate\(-50%/);
});

test("new terminal authority loads after requested corrections but before pile footer", () => {
  const requested = layout.indexOf('import "./presentation/styles/match-requested-corrections-terminal.css";');
  const anchors = layout.indexOf('import "./presentation/styles/priority-card-anchor-terminal.css";');
  const pile = layout.indexOf('import "./presentation/styles/side-pile-text-shadow-terminal.css";');
  assert.ok(requested >= 0 && anchors > requested && pile > anchors);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const gate = fs.readFileSync("app/presentation/runtime/match-runtime-gate.tsx", "utf8");
const runtime = fs.readFileSync("app/presentation/runtime/hand-ai-ui-runtime.tsx", "utf8");
const requestedRuntime = fs.readFileSync("app/presentation/runtime/match-requested-ui-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hand-ai-ui-terminal.css", "utf8");
const tutorialCss = fs.readFileSync("app/presentation/styles/tutorial-current-ui-terminal.css", "utf8");
const tutorial = fs.readFileSync("app/presentation/tutorial/tutorial-screen.tsx", "utf8");
const tutorialContent = fs.readFileSync("app/data/content/tutorial-content.ts", "utf8");

test("hand and current tutorial authorities load after the previous match terminals", () => {
  const piles = layout.indexOf('import "./presentation/styles/side-pile-text-shadow-terminal.css"');
  const hand = layout.indexOf('import "./presentation/styles/hand-ai-ui-terminal.css"');
  const tutorialCurrent = layout.indexOf('import "./presentation/styles/tutorial-current-ui-terminal.css"');
  assert.ok(hand > piles);
  assert.ok(tutorialCurrent > hand);
});

test("responsive hand runtime mounts only with match runtimes", () => {
  assert.match(gate, /import\("\.\/hand-ai-ui-runtime"\)/);
  assert.match(gate, /<HandAiUiRuntime \/>/);
  assert.match(runtime, /densityFor\(count: number\)/);
  assert.match(runtime, /--hh-hand-card-height/);
  assert.match(runtime, /--hh-hand-overlap/);
  assert.match(runtime, /--hh-opponent-card-height/);
  assert.match(runtime, /Math\.max\(0\.78, 1 - overflow \* 0\.035\)/);
});

test("hand cost and creature stats are derived from the existing authoritative card summary", () => {
  assert.match(runtime, /card-tooltip > em/);
  assert.match(runtime, /hh-hand-cost/);
  assert.match(runtime, /hh-hand-atk/);
  assert.match(runtime, /hh-hand-hp/);
  assert.match(runtime, /\^Criatura\\b/i);
  assert.match(css, /hh-hand-cost[\s\S]*?inset-block-start:\s*3\.8%/);
  assert.match(css, /hh-hand-atk[\s\S]*?inset-inline-start:\s*4\.2%[\s\S]*?inset-block-end:\s*3\.8%/);
  assert.match(css, /hh-hand-hp[\s\S]*?inset-inline-end:\s*4\.2%[\s\S]*?inset-block-end:\s*3\.8%/);
  assert.match(css, /font:\s*950 clamp\([^;]*cqi/);
});

test("hand cards interlace progressively and one interaction card becomes fully readable", () => {
  assert.match(css, /margin-inline-start:\s*calc\(0px - var\(--hh-hand-overlap/);
  assert.match(css, /data-hh-hand-active="true"[\s\S]*?translateY\(-28%\) scale\(1\.09\)/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.player-hand > \.card-frame:hover/);
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(css, /hh-touch-drag-source/);
  assert.match(runtime, /pointerdown/);
  assert.match(runtime, /dragstart/);
});

test("card icons disappear during presentation and quarter-turn anchors remain card-local", () => {
  assert.doesNotMatch(requestedRuntime, /ICON_FRAGMENT_SELECTOR|decorateFlight|hh-flight-status-shell/);
  assert.match(runtime, /dataset\.hhCardPresenting/);
  assert.match(runtime, /DOMMatrixReadOnly/);
  assert.match(runtime, /dataset\.hhLocalRotation/);
  assert.match(css, /data-hh-card-presenting="true"[\s\S]*?field-keywords/);
  assert.match(css, /\.hh-flight-face > \.hh-flight-status-shell[\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /data-hh-local-rotation="quarter"[\s\S]*?field-negative-statuses[\s\S]*?rotate\(90deg\)/);
  assert.match(css, /data-hh-local-rotation="quarter"[\s\S]*?field-keywords[\s\S]*?rotate\(90deg\)/);
  assert.match(css, /data-hh-local-rotation="quarter"[\s\S]*?card-frame-activation[\s\S]*?rotate\(90deg\)/);
});

test("AI wait presentation exposes one compact IA pensando state", () => {
  assert.match(runtime, /replace\(\/IA avaliando prioridade\/gi, "IA pensando"\)/);
  assert.match(runtime, /dataset\.hhAiUnified/);
  assert.match(runtime, /dataset\.hhAiBotWait/);
  assert.match(css, /\[data-hemsfell-ai-thinking\][\s\S]*?width:\s*max-content\s*!important/);
  assert.match(css, /\[data-hemsfell-ai-thinking\][\s\S]*?white-space:\s*normal\s*!important/);
  assert.match(css, /response-waiting\[data-hh-ai-bot-wait="true"\]::after[\s\S]*?IA pensando/);
  assert.match(css, /body:has\(\[data-hemsfell-ai-thinking\]\)[\s\S]*?response-waiting[\s\S]*?display:\s*none/);
});

test("tutorial documents the actual responsive hand touch phase and AI behaviors", () => {
  assert.match(tutorial, /TutorialHandVisual/);
  assert.match(tutorial, /tutorial-hand-current/);
  assert.match(tutorial, /IA pensando/);
  assert.match(tutorialContent, /Mão entrelaça/);
  assert.match(tutorialContent, /canto superior esquerdo/);
  assert.match(tutorialContent, /canto inferior esquerdo/);
  assert.match(tutorialContent, /canto inferior direito/);
  assert.match(tutorialContent, /Clique \/ toque/);
  assert.match(tutorialContent, /mouse ou toque/);
  assert.match(tutorialContent, /ação central indicada na interface/);
  assert.match(tutorialCss, /tutorial-hand-demo-card\.is-active/);
  assert.match(tutorialCss, /orientation:\s*landscape/);
  assert.match(tutorialCss, /pointer:\s*coarse/);
});

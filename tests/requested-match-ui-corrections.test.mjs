import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const gate = fs.readFileSync("app/presentation/runtime/match-runtime-gate.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/match-requested-corrections-terminal.css", "utf8");
const runtime = fs.readFileSync("app/presentation/runtime/match-requested-ui-runtime.tsx", "utf8");

test("requested terminal corrections load after mobile/hero authorities and before pile terminal", () => {
  const correction = layout.indexOf('import "./presentation/styles/match-requested-corrections-terminal.css"');
  const heroEffects = layout.indexOf('import "./presentation/styles/hero-active-effects-anchor-terminal.css"');
  const pileTerminal = layout.indexOf('import "./presentation/styles/side-pile-text-shadow-terminal.css"');
  assert.ok(correction > heroEffects);
  assert.ok(pileTerminal > correction);
  assert.match(gate, /import\("\.\/match-requested-ui-runtime"\)/);
  assert.match(gate, /<MatchRequestedUiRuntime \/>/);
});

test("opponent turn plate is content-sized and phase tracker has no underline", () => {
  assert.match(css, /\.phase-orb:empty\s*\{[\s\S]*?width:\s*max-content\s*!important/);
  assert.match(css, /\.phase-orb:empty::before\s*\{[\s\S]*?width:\s*max-content\s*!important/);
  assert.match(css, /\.phase-track[\s\S]*?text-decoration:\s*none\s*!important/);
  assert.match(css, /\.phase-track[\s\S]*?border-bottom:\s*0\s*!important/);
});

test("hero progression typography is shared and evolve action hugs its copy", () => {
  assert.match(css, /canonical-hero-panel[\s\S]*?hero-evolution::after[\s\S]*?font-size:\s*clamp\(/);
  assert.match(css, /\.level-button[\s\S]*?width:\s*max-content\s*!important/);
  assert.match(css, /--hh-active-effects-gap:\s*clamp\(\.035rem/);
});

test("card rails remain polarity anchored and activation stays above the source", () => {
  assert.match(css, /\.card-frame > \.field-negative-statuses[\s\S]*?left:\s*calc\(/);
  assert.match(css, /\.card-frame > \.field-keywords[\s\S]*?right:\s*calc\(/);
  assert.match(css, /\.card-frame > \.card-frame-activation[\s\S]*?top:\s*0\s*!important[\s\S]*?left:\s*50%/);
  assert.match(css, /summoning-sickness-badge[\s\S]*?display:\s*none\s*!important/);
});

test("legacy icon pseudo-tooltips are suppressed in favor of one portal tooltip", () => {
  assert.match(css, /\[data-status\],\[data-keyword\][\s\S]*?::before/);
  assert.match(css, /content:\s*none\s*!important/);
  assert.match(css, /visibility:\s*hidden\s*!important/);
});

test("presentation flights mirror live status/action anchors without rotating them", () => {
  assert.match(runtime, /LIVE_FRAME_SELECTOR/);
  assert.match(runtime, /ICON_FRAGMENT_SELECTOR = "\.field-negative-statuses,\.field-keywords,\.card-frame-activation"/);
  assert.match(runtime, /hh-flight-status-shell/);
  assert.match(runtime, /hemsfell:presentation-action/);
  assert.match(css, /\.hh-flight-status-shell[\s\S]*?transform:\s*none\s*!important/);
});

test("hero level-up says evolution and AI priority sits beside stack when both exist", () => {
  assert.match(runtime, /replace\(\/ASCENSÃO\/gi/);
  assert.match(runtime, /\.priority-stack-indicator/);
  assert.match(runtime, /--hh-ai-paired-left/);
  assert.match(runtime, /stackRect\.right \+ gap/);
  assert.match(css, /data-hh-priority-paired="true"/);
});

test("phone landscape shrinks hero side HUD and bounds all decision windows", () => {
  assert.match(css, /orientation:\s*landscape[\s\S]*?pointer:\s*coarse/);
  assert.match(css, /canonical-hero-panel[\s\S]*?scale:\s*\.8\s*!important/);
  assert.match(css, /enemy-piles,.player-piles[\s\S]*?scale:\s*\.78\s*!important/);
  assert.match(css, /enemy-energy,.player-energy[\s\S]*?scale:\s*\.78\s*!important/);
  assert.match(css, /maintenance-dialog[\s\S]*?max-width:\s*min\(76dvw, 46rem\)/);
  assert.match(css, /response-dialog,.defense-decision,.target-banner[\s\S]*?max-width:\s*min\(29dvw, 19rem\)/);
});

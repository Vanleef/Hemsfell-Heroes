import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("app/presentation/styles/hero-panel-interaction-status-final.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("EVOLUIR stays mounted in the same progress rectangle across readiness changes", () => {
  assert.match(sheet, /player-hero:not\(\.enemy\) > \.level-button[^}]*position: absolute !important[^}]*top: var\(--hero-card-level-top\) !important[^}]*height: var\(--hero-card-level-height\) !important/);
  assert.match(sheet, /not\(\.level-ready\) > \.level-button[^}]*display: grid !important[^}]*opacity: 0 !important[^}]*visibility: hidden !important/);
  assert.match(sheet, /level-ready > \.hero-level-row > \.hero-evolution[^}]*display: grid !important[^}]*opacity: 0 !important/);
  assert.match(sheet, /level-ready > \.level-button[^}]*display: grid !important[^}]*opacity: 1 !important/);
});

test("ready and interactable EVOLUIR has a pulsing aura while disabled state does not", () => {
  assert.match(css, /@keyframes heroEvolveReadyAura/);
  assert.match(sheet, /level-button:not\(:disabled\)[^}]*animation: heroEvolveReadyAura 1\.55s ease-in-out infinite !important/);
  assert.match(sheet, /level-button:disabled[^}]*animation: none !important/);
  assert.match(sheet, /level-button:not\(:disabled\):hover/);
  assert.match(sheet, /prefers-reduced-motion: reduce/);
});

test("active hero effect cues remain visible in compact and expanded overlays", () => {
  assert.match(page, /hero-status-cues/);
  assert.match(page, /heroCueItems\.length>0/);
  assert.match(sheet, /player-hero > \.hero-status-cues[^}]*display: flex !important/);
  assert.match(sheet, /player-hero > \.hero-status-cues[^}]*left: calc\(100% \+ \.34cqw\) !important/);
  assert.match(sheet, /player-hero > \.hero-status-cues[^}]*visibility: visible !important/);
  assert.match(sheet, /hero-status-cues > \.cue-element/);
  assert.match(sheet, /hero-status-cues > \.cue-cost/);
  assert.match(sheet, /hero-status-cues > \.cue-life/);
  assert.match(sheet, /hero-status-cues > \.cue-warning/);
});

test("interaction status authority loads last among match hero styles", () => {
  const readability = layout.indexOf('import "./presentation/styles/match-readability-final.css"');
  const status = layout.indexOf('import "./presentation/styles/hero-panel-interaction-status-final.css"');
  assert.ok(readability >= 0 && status > readability);
});

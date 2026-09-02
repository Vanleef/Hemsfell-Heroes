import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, css, previewRuntime] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/styles/hero-panel-screenshot-fixes.css", import.meta.url), "utf8"),
  readFile(new URL("../app/presentation/cards/card-preview-runtime.tsx", import.meta.url), "utf8"),
]);

test("latest hero screenshot fixes load after requested polish", () => {
  assert.match(
    layout,
    /hero-panel-requested-polish\.css";[\s\S]*hero-panel-screenshot-fixes\.css";/,
  );
});

test("hero progress keeps one semantic label and a separated x/X counter", () => {
  assert.match(
    css,
    /hero-evolution-copy > small::before,[\s\S]*hero-evolution-copy > small::after\s*\{[\s\S]*content:\s*none\s*!important[\s\S]*display:\s*none\s*!important/,
  );
  assert.match(
    css,
    /hero-evolution-copy\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto\s*!important/,
  );
  assert.match(css, /hero-evolution-copy > strong\s*\{[\s\S]*justify-self:\s*end\s*!important/);
});

test("cruel terrain sits left of the right-aligned owner field without overlapping slot one", () => {
  assert.match(
    css,
    /terrain-slot\.enemy-terrain,[\s\S]*terrain-slot\.player-terrain\s*\{[\s\S]*grid-column:\s*2\s*!important[\s\S]*translate:\s*calc\(8\.28cqw - var\(--hero-terrain-gap\)\) 0\s*!important/,
  );
  assert.match(css, /terrain-slot\.enemy-terrain\s*\{[\s\S]*grid-row:\s*3\s*!important/);
  assert.match(css, /terrain-slot\.player-terrain\s*\{[\s\S]*grid-row:\s*5\s*!important/);
  assert.match(css, /translate:\s*calc\(4\.5cqw - var\(--hero-terrain-gap\)\) 0\s*!important/);
});

test("detailed-card hold ring starts only after 500ms while total hold remains one second", () => {
  assert.match(previewRuntime, /const INSPECTION_HOLD_MS = 1_000;/);
  assert.match(previewRuntime, /const INSPECTION_PROGRESS_DELAY_MS = 500;/);
  assert.match(
    previewRuntime,
    /const INSPECTION_PROGRESS_MS = INSPECTION_HOLD_MS - INSPECTION_PROGRESS_DELAY_MS;/,
  );
  assert.match(
    previewRuntime,
    /holdDelayTimer = window\.setTimeout\(\(\) => \{[\s\S]*document\.createElement\("span"\)[\s\S]*--card-inspection-hold-duration[\s\S]*INSPECTION_PROGRESS_MS[\s\S]*\}, INSPECTION_PROGRESS_DELAY_MS\);/,
  );
});
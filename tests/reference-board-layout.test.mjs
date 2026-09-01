import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [css, layout, page] = await Promise.all([
  readFile(new URL("../app/presentation/styles/board/reference-layout.css", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);
const polish = await readFile(new URL("../app/presentation/styles/reference-composition-polish.css", import.meta.url), "utf8");

test("approved reference layout is the final board geometry authority", () => {
  const legacyAuthority = layout.indexOf('import "./presentation/styles/command-bar-fixes.css"');
  const referenceAuthority = layout.indexOf('import "./presentation/styles/board/reference-layout.css"');
  assert.ok(legacyAuthority >= 0);
  assert.ok(referenceAuthority > legacyAuthority);
});

test("reference board fills the live viewport without desktop letterboxing", () => {
  assert.match(css, /\.screen-game \.game-stage\s*\{[\s\S]*?place-items:\s*stretch\s*!important[\s\S]*?width:\s*100dvw\s*!important[\s\S]*?height:\s*100dvh\s*!important/);
  assert.match(css, /> \.game-content\.hs-board\s*\{[\s\S]*?width:\s*100dvw\s*!important[\s\S]*?height:\s*100dvh\s*!important[\s\S]*?aspect-ratio:\s*auto\s*!important/);
});

test("desktop battlefield keeps five paired creature and auxiliary lanes", () => {
  assert.match(page, /field-slot creature-slot/);
  assert.match(page, /field-slot auxiliary-slot/);
  assert.match(page, /data-slot=\{slot\+1\}/);
  assert.match(css, /> \.paired-field > \.field-column\s*\{[\s\S]*?display:\s*contents\s*!important/);
  assert.match(css, /> \.paired-field\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)\s*!important[\s\S]*?grid-template-rows:\s*repeat\(2, minmax\(0, 1fr\)\)\s*!important/);

  for (let slot = 1; slot <= 5; slot += 1) {
    assert.match(css, new RegExp(`creature-slot\\[data-slot="${slot}"\\] \\{ grid-column: ${slot} !important; \\}`));
    assert.match(css, new RegExp(`auxiliary-slot\\[data-slot="${slot}"\\] \\{ grid-column: ${slot} !important; \\}`));
  }
  assert.match(css, /\.paired-field \.creature-slot\s*\{ grid-row:\s*1\s*!important/);
  assert.match(css, /\.paired-field \.auxiliary-slot\s*\{ grid-row:\s*2\s*!important/);
});

test("terrain, energy and phase follow the approved horizontal hierarchy", () => {
  assert.match(css, /> \.enemy-terrain\s*\{[\s\S]*?grid-column:\s*2\s*!important/);
  assert.match(css, /> \.player-terrain\s*\{[\s\S]*?grid-column:\s*2\s*!important/);
  assert.match(css, /> \.field-energy\s*\{[\s\S]*?justify-self:\s*start\s*!important[\s\S]*?width:\s*calc\(100% - 2 \* var\(--hh-ref-edge\)\)\s*!important/);
  assert.match(css, /> \.phase-orb\s*\{[\s\S]*?grid-column:\s*4\s*!important[\s\S]*?grid-row:\s*4 \/ 7\s*!important/);
  assert.match(css, /> \.enemy-piles\s*\{[\s\S]*?grid-column:\s*5\s*!important/);
  assert.match(css, /> \.player-piles\s*\{[\s\S]*?grid-column:\s*5\s*!important/);
  assert.match(css, /width:\s*clamp\(3rem, min\(5\.9cqw, 10\.4cqh\), 5\.8rem\)\s*!important/);
});

test("reference proportions anchor every permanent region without free coordinates", () => {
  assert.match(css, /minmax\(0, 19fr\)[\s\S]*?minmax\(0, 8\.5fr\)[\s\S]*?minmax\(0, 46fr\)[\s\S]*?minmax\(0, 12\.5fr\)[\s\S]*?minmax\(0, 14fr\)/);
  assert.match(css, /minmax\(0, 4\.5fr\)[\s\S]*?minmax\(0, 8\.5fr\)[\s\S]*?minmax\(0, 9\.5fr\)[\s\S]*?minmax\(0, 27\.5fr\)[\s\S]*?minmax\(0, 5\.5fr\)[\s\S]*?minmax\(0, 23fr\)[\s\S]*?minmax\(0, 4\.5fr\)[\s\S]*?minmax\(0, 17fr\)/);
  assert.match(css, /> \.player-hero\.enemy\s*\{[\s\S]*?align-self:\s*start\s*!important/);
  assert.match(css, /> \.player-hero:not\(\.enemy\)\s*\{[\s\S]*?align-self:\s*end\s*!important/);
  assert.doesNotMatch(css, /(?:top|left|right|bottom):\s*\d+(?:\.\d+)?(?:px|vw|vh)\s*!important/);
});

test("mobile uses the real viewport and never restores the old 62rem scroll canvas", () => {
  assert.doesNotMatch(css, /min-width:\s*62rem\s*!important/);
  assert.match(css, /@media \(orientation: portrait\)\s*\{/);
  assert.doesNotMatch(css, /@media \(orientation: portrait\) and \(max-width:/);
  assert.match(css, /body\[data-match-active="true"\] \.screen-game\s*\{[\s\S]*?position:\s*fixed\s*!important[\s\S]*?inset:\s*0\s*!important/);
  assert.match(css, /width:\s*100dvw\s*!important/);
  assert.match(css, /height:\s*100dvh\s*!important/);
  assert.match(css, /min-width:\s*0\s*!important/);
  assert.match(css, /overflow:\s*hidden\s*!important/);
  assert.match(css, /grid-template-rows:\s*repeat\(2, minmax\(0, 1fr\)\)\s*!important/);
  assert.match(polish, /> \.priority-control-toggle\s*\{[\s\S]*?top:\s*\.45cqh\s*!important[\s\S]*?right:\s*clamp\(6\.4rem, 9\.2cqw, 8\.6rem\)\s*!important/);
});

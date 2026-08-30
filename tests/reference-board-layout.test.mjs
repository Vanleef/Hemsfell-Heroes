import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [css, layout, page] = await Promise.all([
  readFile(new URL("../app/presentation/styles/board/reference-layout.css", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
]);

test("approved reference layout is the final board geometry authority", () => {
  const legacyAuthority = layout.indexOf('import "./presentation/styles/command-bar-fixes.css"');
  const referenceAuthority = layout.indexOf('import "./presentation/styles/board/reference-layout.css"');
  assert.ok(legacyAuthority >= 0);
  assert.ok(referenceAuthority > legacyAuthority);
});

test("desktop battlefield separates creature and auxiliary groups without changing slot DOM", () => {
  assert.match(page, /field-slot creature-slot/);
  assert.match(page, /field-slot auxiliary-slot/);
  assert.match(page, /data-slot=\{slot\+1\}/);
  assert.match(css, /> \.paired-field > \.field-column\s*\{[\s\S]*?display:\s*contents\s*!important/);

  for (let slot = 1; slot <= 5; slot += 1) {
    assert.match(css, new RegExp(`creature-slot\\[data-slot="${slot}"\\] \\{ grid-column: ${slot} !important; \\}`));
    assert.match(css, new RegExp(`auxiliary-slot\\[data-slot="${slot}"\\] \\{ grid-column: ${slot + 6} !important; \\}`));
  }
});

test("terrain, energy and phase follow the approved horizontal hierarchy", () => {
  assert.match(css, /> \.enemy-terrain\s*\{[\s\S]*?grid-column:\s*2\s*!important/);
  assert.match(css, /> \.player-terrain\s*\{[\s\S]*?grid-column:\s*2\s*!important/);
  assert.match(css, /> \.field-energy\s*\{[\s\S]*?justify-self:\s*start\s*!important[\s\S]*?width:\s*47\.2%\s*!important/);
  assert.match(css, /> \.phase-orb\s*\{[\s\S]*?grid-column:\s*3\s*!important[\s\S]*?grid-row:\s*7\s*!important/);
  assert.match(css, /width:\s*clamp\(2\.35rem, min\(5\.15cqw, 10\.5cqh\), 5\.35rem\)\s*!important/);
});

test("mobile uses the real viewport and never restores the old 62rem scroll canvas", () => {
  assert.doesNotMatch(css, /min-width:\s*62rem\s*!important/);
  assert.match(css, /@media \(orientation: portrait\) and \(max-width: 60rem\)/);
  assert.match(css, /width:\s*100dvw\s*!important/);
  assert.match(css, /height:\s*100dvh\s*!important/);
  assert.match(css, /min-width:\s*0\s*!important/);
  assert.match(css, /overflow:\s*hidden\s*!important/);
  assert.match(css, /grid-template-rows:\s*repeat\(2, minmax\(0, 1fr\)\)\s*!important/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../app/presentation/styles/hero-panel-compact-fix.css', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');

test('compact hero level is a real portrait overlay instead of a static grid item', () => {
  assert.match(css, /hero-level-row > \.hero-level[\s\S]*position:\s*absolute\s*!important/);
  assert.match(css, /hero-level-row > \.hero-level[\s\S]*calc\(100% \+ var\(--hero-card-level-gap\)/);
  assert.match(css, /hero-level-row[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/);
  assert.match(css, /hero-level-row > \.hero-evolution[\s\S]*grid-column:\s*1 \/ -1\s*!important/);
});

test('compact landscape keeps more artwork and readable progress/evolve bands', () => {
  assert.match(css, /--hero-card-art-height:\s*18\.8cqh/);
  assert.match(css, /--hero-card-level-height:\s*3\.4cqh/);
  assert.match(css, /height:\s*2\.65cqh\s*!important/);
});

test('compact correction loads after earlier hero panel geometry files', () => {
  const breathing = layout.indexOf('hero-panel-breathing-room.css');
  const compactFix = layout.indexOf('hero-panel-compact-fix.css');
  assert.ok(breathing >= 0 && compactFix > breathing);
});

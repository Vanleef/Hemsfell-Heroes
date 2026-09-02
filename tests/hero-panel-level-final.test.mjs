import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css=fs.readFileSync("app/presentation/styles/hero-panel-level-final.css","utf8");
const layout=fs.readFileSync("app/layout.tsx","utf8");

test("hero level badge is a fully styled portrait overlay",()=>{
  assert.match(css,/hero-level-row\s*>\s*\.hero-level\s*\{/);
  assert.match(css,/position:\s*absolute\s*!important/);
  assert.match(css,/color:\s*#f5dfa0\s*!important/);
  assert.match(css,/background:[\s\S]*linear-gradient/);
  assert.match(css,/z-index:\s*120\s*!important/);
  assert.match(css,/visibility:\s*visible\s*!important/);
});

test("progress owns the full row and final level authority loads last",()=>{
  assert.match(css,/hero-level-row\s*>\s*\.hero-evolution\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1\s*!important/);
  const compact=layout.indexOf('hero-panel-compact-fix.css');
  const finalLevel=layout.indexOf('hero-panel-level-final.css');
  assert.ok(compact>=0&&finalLevel>compact,"final level stylesheet must load after compact tuning");
});

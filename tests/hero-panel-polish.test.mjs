import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const heroCss = await readFile(new URL("../app/presentation/styles/hero-panel-reference.css", import.meta.url), "utf8");
const finalMarker = "Requested compact hero-card polish";
const finalCss = heroCss.slice(heroCss.lastIndexOf(finalMarker));

test("hero panels are shorter, wider and pulled inward from the screen edges", () => {
  assert.match(finalCss, /width:\s*min\(18\.35cqw, 31\.8cqh\)\s*!important/);
  assert.match(finalCss, /height:\s*calc\(100% - 1\.6cqh\)\s*!important/);
  assert.match(finalCss, /canonical-hero-panel\.enemy[\s\S]*?align-self:\s*end\s*!important/);
  assert.match(finalCss, /canonical-hero-panel\.player[\s\S]*?align-self:\s*start\s*!important/);
});

test("level and life share the portrait baseline while progression owns the full row", () => {
  assert.match(finalCss, /hero-power-trigger > \.hero-life[\s\S]*?bottom:\s*\.58cqh[\s\S]*?height:\s*2\.68cqh/);
  assert.match(finalCss, /hero-level-row > \.hero-level[\s\S]*?position:\s*absolute[\s\S]*?bottom:\s*calc\(100% \+ var\(--hero-card-level-gap\) \+ \.58cqh\)[\s\S]*?height:\s*2\.68cqh/);
  assert.match(finalCss, /hero-level-row > \.hero-evolution[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%/);
  assert.match(finalCss, /hero-evolution-copy > small::after[\s\S]*?content:\s*"PRÓXIMO NÍVEL"/);
});

test("hero name is a compact portrait nameplate", () => {
  assert.match(finalCss, /hero-power-trigger > \.hero-short-name[\s\S]*?left:\s*24%[\s\S]*?right:\s*24%[\s\S]*?height:\s*2\.08cqh[\s\S]*?border:/);
  assert.match(finalCss, /hero-power-trigger > \.hero-portrait[\s\S]*?inset:\s*0\s*!important/);
});

test("ability chips show only a larger level index and description", () => {
  assert.match(finalCss, /hero-ability-chip > \.hero-ability-slot[\s\S]*?width:\s*min\(2\.92cqh, 1\.72cqw\)[\s\S]*?font-size:\s*clamp\(\.52rem/);
  assert.match(finalCss, /hero-ability-chip > \.hero-ability-copy[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(finalCss, /hero-ability-copy > b[\s\S]*?display:\s*none\s*!important[\s\S]*?visibility:\s*hidden\s*!important/);
});

test("ability tooltip is detached, card-like and retains the ability type text", () => {
  assert.match(finalCss, /hero-ability-chip::after[\s\S]*?content:\s*attr\(data-ability-tooltip\)[\s\S]*?left:\s*calc\(100% \+ 1\.35cqw\)/);
  assert.match(finalCss, /hero-ability-chip::after[\s\S]*?border-top-width:[\s\S]*?radial-gradient[\s\S]*?backdrop-filter:\s*blur\(8px\)/);
  assert.match(finalCss, /hero-ability-chip:is\(:hover, :focus-visible\)::after[\s\S]*?opacity:\s*1[\s\S]*?visibility:\s*visible/);
});

test("evolve action is deliberately more compact", () => {
  assert.match(finalCss, /player-hero:not\(\.enemy\) > \.level-button[\s\S]*?left:\s*19%[\s\S]*?width:\s*62%[\s\S]*?height:\s*2\.32cqh/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hero-ability-layout-contract.css", "utf8");
const capsuleCss = fs.readFileSync("app/presentation/styles/hero-ability-capsule-structure-final.css", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);
const capsuleSheet = compact(capsuleCss);

test("hero ability capsule refinement loads after the base ability contract and before terminal interactions", () => {
  const cssImports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  const abilityIndex = cssImports.indexOf("./presentation/styles/hero-ability-layout-contract.css");
  const capsuleIndex = cssImports.indexOf("./presentation/styles/hero-ability-capsule-structure-final.css");
  const terminalIndex = cssImports.indexOf("./presentation/styles/match-interaction-terminal.css");
  assert.ok(abilityIndex >= 0);
  assert.equal(capsuleIndex, abilityIndex + 1);
  assert.equal(terminalIndex, capsuleIndex + 1);
  assert.equal(cssImports.at(-1), "./presentation/styles/match-interaction-terminal.css");
});

test("expanded hero abilities remain three independent rows with number description and kind columns", () => {
  assert.match(sheet, /hero-command-bar[^}]*grid-template-rows: repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(capsuleSheet, /hero-ability-chip[^}]*grid-template-columns:[^}]*clamp\(1\.48rem, 2\.72cqh, 2\.12rem\)[^}]*minmax\(0, 1fr\)[^}]*clamp\(2\.7rem, 4\.15cqw, 4\.25rem\) !important/);
});

test("ability indices 1 2 3 remain visible inside the shared capsule", () => {
  assert.match(page, /hero-ability-slot[^>]*aria-hidden="true"[^>]*>\{slot\+1\}<\/i>/);
  const slotRule = sheet.match(/hero-ability-slot \{([^}]*)\}/)?.[1] ?? "";
  assert.match(slotRule, /font-size: clamp\(\.72rem, min\(1\.04cqw, 1\.52cqh\), 1rem\) !important/);
  assert.match(slotRule, /color: #f4ead0 !important/);
  assert.match(slotRule, /text-indent: 0 !important/);
  assert.doesNotMatch(slotRule, /font-size: 0/);
  assert.match(capsuleSheet, /hero-ability-chip::before[^}]*grid-column: 1 \/ 3 !important/);
  assert.match(capsuleSheet, /hero-ability-slot[^}]*grid-column: 1 !important[^}]*z-index: 1 !important/);
});

test("one capsule contains number plus description and ends before PASSIVA or ATIVA", () => {
  assert.match(capsuleSheet, /hero-ability-chip::before[^}]*grid-column: 1 \/ 3 !important[^}]*border:[^}]*border-radius:[^}]*background: linear-gradient/);
  assert.match(capsuleSheet, /hero-ability-copy > p[^}]*grid-column: 2 !important[^}]*border: 0 !important[^}]*background: transparent !important/);
  assert.match(capsuleSheet, /hero-ability-copy > b[^}]*grid-column: 3 !important[^}]*justify-self: start !important/);
  assert.match(capsuleSheet, /hero-ability-copy > b[^}]*border: 0 !important[^}]*background: transparent !important/);
});

test("active and hover paint stays on the shared capsule rather than the kind label", () => {
  assert.match(capsuleSheet, /hero-ability-chip\.is-active\.is-available::before[^}]*border-color: rgb\(231 194 78 \/ 58%\) !important/);
  assert.match(capsuleSheet, /hero-ability-chip\.is-active\.is-available:hover::before[^}]*border-color: rgb\(244 211 105 \/ 84%\) !important/);
  assert.match(capsuleSheet, /hero-ability-chip\.is-active\.is-available > \.hero-ability-copy > p,[^{]*hero-ability-chip\.is-active\.is-available:hover > \.hero-ability-copy > p[^}]*background: transparent !important/);
  assert.match(sheet, /hero-ability-chip\.is-active > \.hero-ability-copy > b[^}]*color: #f0ce69 !important/);
  assert.doesNotMatch(capsuleSheet, /#(?:8d45ce|8763a9|b98cff)/i);
});
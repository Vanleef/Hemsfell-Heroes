import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hero-ability-layout-contract.css", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("hero ability contract loads immediately before the terminal interaction layer", () => {
  const cssImports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  const abilityIndex = cssImports.indexOf("./presentation/styles/hero-ability-layout-contract.css");
  const terminalIndex = cssImports.indexOf("./presentation/styles/match-interaction-terminal.css");
  assert.ok(abilityIndex >= 0 && terminalIndex === abilityIndex + 1);
  assert.equal(cssImports.at(-1), "./presentation/styles/match-interaction-terminal.css");
});

test("expanded hero abilities remain three independent rows with number description and kind columns", () => {
  assert.match(sheet, /hero-command-bar[^}]*grid-template-rows: repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(sheet, /hero-ability-chip[^}]*grid-template-columns:[^}]*clamp\(1\.48rem, 2\.72cqh, 2\.12rem\)[^}]*minmax\(0, 1fr\)[^}]*clamp\(2\.7rem, 4\.15cqw, 4\.25rem\) !important/);
});

test("ability indices 1 2 3 are visible and large enough to scan", () => {
  assert.match(page, /hero-ability-slot[^>]*aria-hidden="true"[^>]*>\{slot\+1\}<\/i>/);
  const slotRule = sheet.match(/hero-ability-slot \{([^}]*)\}/)?.[1] ?? "";
  assert.match(slotRule, /font-size: clamp\(\.72rem, min\(1\.04cqw, 1\.52cqh\), 1rem\) !important/);
  assert.match(slotRule, /color: #f4ead0 !important/);
  assert.match(slotRule, /text-indent: 0 !important/);
  assert.doesNotMatch(slotRule, /font-size: 0/);
  assert.match(sheet, /hero-ability-slot::before,[^{]*hero-ability-slot::after[^}]*content: none !important/);
});

test("PASSIVA and ATIVA sit to the right outside the description capsule", () => {
  assert.match(sheet, /hero-ability-copy[^}]*display: contents !important/);
  assert.match(sheet, /hero-ability-copy > p[^}]*grid-column: 2 !important[^}]*border:[^}]*border-radius:[^}]*background: linear-gradient/);
  assert.match(sheet, /hero-ability-copy > b[^}]*grid-column: 3 !important[^}]*justify-self: end !important/);
  assert.match(sheet, /hero-ability-copy > b[^}]*border: 0 !important[^}]*border-radius: 0 !important[^}]*background: transparent !important/);
  assert.match(sheet, /hero-ability-copy > p[^}]*white-space: normal !important/);
  assert.match(sheet, /hero-ability-copy > p[^}]*overflow-wrap: anywhere !important/);
});

test("active ability keeps a neutral gold semantic accent", () => {
  assert.match(sheet, /hero-ability-chip\.is-active > \.hero-ability-slot[^}]*border-color: rgb\(239 202 83 \/ 94%\) !important/);
  assert.match(sheet, /hero-ability-chip\.is-active > \.hero-ability-copy > b[^}]*color: #f0ce69 !important/);
  assert.doesNotMatch(sheet, /#(?:8d45ce|8763a9|b98cff)/i);
});

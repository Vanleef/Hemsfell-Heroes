import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/hero-ability-layout-contract.css", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const compact = (value) => value.replace(/\s+/g, " ");
const sheet = compact(css);

test("hero ability contract is the last stylesheet authority", () => {
  const cssImports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  assert.ok(cssImports.length > 0);
  assert.equal(cssImports.at(-1), "./presentation/styles/hero-ability-layout-contract.css");
});

test("expanded hero abilities remain three independent rows", () => {
  assert.match(sheet, /hero-command-bar[^}]*grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(sheet, /hero-command-bar[^}]*grid-template-rows: repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(sheet, /hero-ability-chip[^}]*grid-template-columns: clamp\(1\.45rem, 2\.55cqh, 2\.05rem\) minmax\(0, 1fr\) !important/);
  assert.match(sheet, /hero-ability-chip[^}]*border-radius: clamp\(\.34rem, \.48cqw, \.54rem\) !important/);
});

test("slot numbers are implementation details and render as semantic icons", () => {
  assert.match(page, /hero-ability-slot[^>]*aria-hidden="true"[^>]*>\{slot\+1\}<\/i>/);
  assert.match(sheet, /hero-ability-slot[^}]*font-size: 0 !important/);
  assert.match(sheet, /hero-ability-slot[^}]*text-indent: -9999px !important/);
  assert.match(sheet, /hero-ability-slot::before[^}]*content: "" !important/);
  assert.match(sheet, /hero-ability-chip\.is-active > \.hero-ability-slot::before[^}]*clip-path:/);
});

test("ability label and description have explicit hierarchy and spacing", () => {
  assert.match(sheet, /hero-ability-copy[^}]*grid-template-rows: auto minmax\(0, 1fr\) !important/);
  assert.match(sheet, /hero-ability-copy[^}]*gap: clamp\(\.08rem, \.18cqh, \.18rem\) !important/);
  assert.match(sheet, /hero-ability-copy > b[^}]*border-radius: 999px !important/);
  assert.match(sheet, /hero-ability-copy > b[^}]*letter-spacing: \.075em !important/);
  assert.match(sheet, /hero-ability-copy > p[^}]*white-space: normal !important/);
  assert.match(sheet, /hero-ability-copy > p[^}]*overflow-wrap: anywhere !important/);
});

test("active feedback is neutral-gold instead of the legacy purple selected row", () => {
  assert.match(sheet, /hero-ability-chip\.is-active\.is-available[^}]*border-color: rgb\(231 194 78 \/ 66%\) !important/);
  assert.match(sheet, /hero-ability-chip\.is-active > \.hero-ability-copy > b[^}]*color: #f0ce69 !important/);
  assert.doesNotMatch(sheet, /#(?:8d45ce|8763a9|b98cff)/i);
});

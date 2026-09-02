import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/side-piles-readability-final.css", "utf8").replace(/\s+/g, " ");

test("side pile readability contract loads before ability and terminal interaction contracts", () => {
  const imports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  const piles = imports.indexOf("./presentation/styles/side-piles-readability-final.css");
  const ability = imports.indexOf("./presentation/styles/hero-ability-layout-contract.css");
  const terminal = imports.indexOf("./presentation/styles/match-interaction-terminal.css");
  assert.ok(piles >= 0);
  assert.ok(piles < ability);
  assert.ok(ability < terminal);
});

test("each pile separates a large visual stage from a dedicated footer row", () => {
  assert.match(css, /pile-zone[^}]*grid-template-columns: minmax\(0, 1fr\) auto !important/);
  assert.match(css, /pile-zone[^}]*grid-template-rows: minmax\(0, 1fr\) clamp\(1rem, 2\.25cqh, 1\.45rem\) !important/);
  assert.match(css, /pile-zone > \.pile-card[^}]*height: 92% !important[^}]*max-width: 91% !important/);
  assert.match(css, /revealed-deck-stack[^}]*grid-column: 1 \/ -1 !important[^}]*grid-row: 1 !important/);
});

test("pile footer uses a bottom contrast gradient and crisp outlined label/count", () => {
  assert.match(css, /pile-zone::after[^}]*height: 34% !important[^}]*background: linear-gradient/);
  assert.match(css, /pile-zone > b,[^{]*pile-zone > strong[^}]*font-size: clamp\(\.48rem, min\(\.66cqw, 1\.08cqh\), \.76rem\) !important/);
  assert.match(css, /-webkit-text-stroke: max\(\.2px, \.018rem\) rgb\(0 0 0 \/ 74%\) !important/);
  assert.match(css, /pile-zone > strong[^}]*font-variant-numeric: tabular-nums !important/);
  assert.match(css, /pile-zone > small[^}]*display: none !important/);
});

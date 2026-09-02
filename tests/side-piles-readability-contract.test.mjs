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

test("pile visual surface remains full bleed behind the footer", () => {
  assert.match(css, /pile-zone[^}]*padding: 0 !important/);
  assert.match(css, /pile-zone > \.pile-card,[^{]*pile-zone > \.revealed-deck-stack[^}]*grid-row: 1 \/ -1 !important[^}]*width: 100% !important[^}]*height: 100% !important/);
  assert.match(css, /revealed-deck-stack > \.pile-card[^}]*width: 100% !important[^}]*height: 100% !important/);
});

test("symbolic pile art is proportionally larger", () => {
  assert.match(css, /pile-zone\.extra-deck > \.pile-card > i,[^{]*pile-zone\.obscuro > \.pile-card > i,[^{]*pile-zone\.grave > \.pile-card > i[^}]*font-size: clamp\(1\.38rem, min\(2\.38cqw, 4\.15cqh\), 2\.42rem\) !important[^}]*scale: 1\.12 !important/);
  assert.match(css, /pile-zone\.main-deck > \.pile-card\.official-card-back > i[^}]*scale: 1\.3 !important/);
});

test("pile footer keeps larger edge margins and crisp outlined label/count", () => {
  assert.match(css, /pile-zone::after[^}]*height: 38% !important[^}]*background: linear-gradient/);
  assert.match(css, /pile-zone > b,[^{]*pile-zone > strong[^}]*clamp\(\.22rem, \.32cqw, \.34rem\)[^}]*clamp\(\.14rem, \.22cqh, \.2rem\) !important/);
  assert.match(css, /-webkit-text-stroke: max\(\.2px, \.018rem\) rgb\(0 0 0 \/ 74%\) !important/);
  assert.match(css, /pile-zone > strong[^}]*font-variant-numeric: tabular-nums !important/);
  assert.match(css, /pile-zone > small[^}]*display: none !important/);
});

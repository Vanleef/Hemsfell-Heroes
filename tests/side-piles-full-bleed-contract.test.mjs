import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("app/presentation/styles/side-piles-readability-final.css", "utf8");
const sheet = css.replace(/\s+/g, " ");

test("pile visual surface fills the complete pile panel behind the footer", () => {
  assert.match(sheet, /side-piles > \.pile-zone \{[^}]*padding: 0 !important/);
  assert.match(sheet, /pile-zone > \.pile-card,[^{]*pile-zone > \.revealed-deck-stack \{[^}]*grid-row: 1 \/ -1 !important[^}]*width: 100% !important[^}]*height: 100% !important/);
  assert.match(sheet, /pile-zone\.extra-deck > \.pile-card,[^{]*pile-zone\.obscuro > \.pile-card,[^{]*pile-zone\.grave > \.pile-card,[^{]*pile-zone\.main-deck > \.pile-card \{[^}]*width: 100% !important[^}]*height: 100% !important[^}]*aspect-ratio: auto !important/);
});

test("pile footer remains an overlay with readability gradient", () => {
  assert.match(sheet, /pile-zone::after \{[^}]*bottom: 0 !important[^}]*background: linear-gradient/);
  assert.match(sheet, /pile-zone > b,[^{]*pile-zone > strong \{[^}]*grid-row: 2 !important[^}]*z-index: 2 !important/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("app/presentation/styles/match-visual-terminal.css", "utf8").replace(/\s+/g, " ");

test("opponent energy moves responsively toward the phase action", () => {
  assert.match(css, /enemy-energy \{ translate: 0 clamp\(\.55rem, 2\.8cqh, 1\.25rem\) !important/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 44rem\)[\s\S]*enemy-energy \{ translate: 0 clamp\(\.42rem, 2\.35cqh, \.92rem\) !important/);
});

test("pile readability shading belongs to the footer row instead of a floating overlay", () => {
  assert.match(css, /side-piles > \.pile-zone::after \{[^}]*content: none !important[^}]*display: none !important[^}]*background: none !important/);
  assert.match(css, /side-piles > \.pile-zone > :is\(b, strong\) \{[^}]*align-self: stretch !important[^}]*display: flex !important[^}]*align-items: flex-end !important[^}]*background: linear-gradient/);
  assert.match(css, /side-piles > \.pile-zone > b \{[^}]*justify-content: flex-start !important/);
  assert.match(css, /side-piles > \.pile-zone > strong \{[^}]*justify-content: flex-end !important/);
});

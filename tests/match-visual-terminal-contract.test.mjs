import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/match-visual-terminal.css", "utf8").replace(/\s+/g, " ");

test("visual terminal stylesheet is the final CSS authority", () => {
  const imports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  assert.equal(imports.at(-1), "./presentation/styles/match-visual-terminal.css");
});

test("player phase CTA exposes readable current and next phase text", () => {
  assert.match(css, /phase-orb:has\(> button\)\[data-phase-current\]::before[^}]*font-size: clamp\(\.72rem/);
  assert.match(css, /phase-orb > button::after[^}]*content: attr\(data-phase-next\) !important[^}]*position: static !important/);
  assert.match(css, /phase-orb > button::after[^}]*font-size: clamp\(\.92rem/);
  assert.match(css, /button:not\(\[data-phase-next\]\)::after,[^{]*button\[data-phase-next=""\]::after[^}]*content: "AVANÇAR" !important/);
});

test("graveyard thumbnail crops the catalogue rules panel instead of showing a fake dark band", () => {
  assert.match(css, /pile-zone\.grave > \.pile-card[^}]*overflow: hidden !important/);
  assert.match(css, /pile-zone\.grave > \.pile-card > \.remote-card-art[^}]*transform: scale\(1\.52\) !important[^}]*transform-origin: 50% 8% !important/);
  assert.match(css, /pile-zone::after[^}]*height: clamp\(\.66rem, 1\.25cqh, \.9rem\) !important/);
});

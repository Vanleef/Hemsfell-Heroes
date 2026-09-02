import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/match-visual-terminal.css", "utf8").replace(/\s+/g, " ");

test("visual terminal stylesheet is the final CSS authority", () => {
  const imports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  assert.equal(imports.at(-1), "./presentation/styles/match-visual-terminal.css");
});

test("player phase CTA width follows the action copy rather than a fixed clamp", () => {
  assert.match(css, /phase-orb:has\(> button\)[^{]*\{[^}]*width: max-content !important/);
  assert.match(css, /phase-orb:has\(> button\)\[data-phase-current\]::before[^}]*position: absolute !important[^}]*width: max-content !important[^}]*transform: translateX\(-50%\) !important/);
  assert.match(css, /phase-orb > button \{[^}]*grid-template-columns: max-content auto !important[^}]*width: max-content !important/);
  assert.doesNotMatch(css, /phase-orb:has\(> button\)[^{]*\{[^}]*width: clamp\(/);
});

test("player phase CTA keeps its copy on one responsive line", () => {
  assert.match(css, /phase-orb > button::after[^}]*content: attr\(data-phase-next\) !important[^}]*width: max-content !important[^}]*white-space: nowrap !important/);
  assert.match(css, /button\[data-phase-next="FINALIZAÇÃO"\]::after[^}]*font-size: clamp\(\.56rem/);
  assert.match(css, /button\[data-phase-next="ENCERRAR TURNO"\]::after[^}]*font-size: clamp\(\.52rem/);
  assert.match(css, /button:not\(\[data-phase-next\]\)::after,[^{]*button\[data-phase-next=""\]::after[^}]*content: "AVANÇAR" !important/);
});

test("phase CTA has no left icon and arrow has no circular plate", () => {
  assert.match(css, /phase-orb > button::before[^}]*content: none !important[^}]*display: none !important/);
  assert.match(css, /phase-orb > button > span[^}]*border: 0 !important[^}]*border-radius: 0 !important[^}]*background: transparent !important[^}]*box-shadow: none !important/);
});

test("real cards shown on side piles have no pile shadow or overlay", () => {
  assert.match(css, /pile-zone > \.pile-card,[^{]*pile-zone > \.pile-card > :is\(\.remote-card-art, canvas, img\)[^}]*box-shadow: none !important[^}]*filter: none !important/);
  assert.match(css, /pile-zone:has\(> \.pile-card > \.remote-card-art\)::after[^}]*content: none !important[^}]*display: none !important[^}]*background: none !important/);
});

test("graveyard top card remains neutral full bleed without crop or zoom", () => {
  assert.match(css, /pile-zone\.grave > \.pile-card[^}]*transform: none !important[^}]*scale: 1 !important/);
  assert.match(css, /pile-zone\.grave > \.pile-card > :is\(\.remote-card-art, canvas, img\)[^}]*transform: none !important[^}]*scale: 1 !important[^}]*object-fit: cover !important[^}]*object-position: center center !important/);
  assert.doesNotMatch(css, /transform: scale\(1\.(?:48|52)\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/match-visual-terminal.css", "utf8").replace(/\s+/g, " ");

test("visual terminal stylesheet is the final CSS authority", () => {
  const imports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  assert.equal(imports.at(-1), "./presentation/styles/match-visual-terminal.css");
});

test("player phase CTA keeps its copy on one responsive line", () => {
  assert.match(css, /phase-orb:has\(> button\)\[data-phase-current\]::before[^}]*font-size: clamp\(\.68rem[^}]*white-space: nowrap !important/);
  assert.match(css, /phase-orb > button \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto !important/);
  assert.match(css, /phase-orb > button::after[^}]*content: attr\(data-phase-next\) !important[^}]*font-size: clamp\(\.62rem[^}]*white-space: nowrap !important/);
  assert.match(css, /button\[data-phase-next="FINALIZAÇÃO"\]::after[^}]*font-size: clamp\(\.58rem/);
  assert.match(css, /button\[data-phase-next="ENCERRAR TURNO"\]::after[^}]*font-size: clamp\(\.54rem/);
  assert.match(css, /button:not\(\[data-phase-next\]\)::after,[^{]*button\[data-phase-next=""\]::after[^}]*content: "AVANÇAR" !important/);
});

test("phase CTA has no left icon and arrow has no circular plate", () => {
  assert.match(css, /phase-orb > button::before[^}]*content: none !important[^}]*display: none !important/);
  assert.match(css, /phase-orb > button > span[^}]*border: 0 !important[^}]*border-radius: 0 !important[^}]*background: transparent !important[^}]*box-shadow: none !important/);
});

test("graveyard thumbnail remains neutral full bleed without crop or zoom", () => {
  assert.match(css, /pile-zone\.grave > \.pile-card[^}]*transform: none !important[^}]*filter: none !important/);
  assert.match(css, /pile-zone\.grave > \.pile-card > :is\(\.remote-card-art, canvas, img\)[^}]*transform: none !important[^}]*scale: 1 !important[^}]*filter: none !important[^}]*object-fit: cover !important[^}]*object-position: center center !important/);
  assert.doesNotMatch(css, /transform: scale\(1\.(?:48|52)\)/);
  assert.match(css, /pile-zone::after[^}]*height: clamp\(\.62rem, 1\.18cqh, \.88rem\) !important/);
});

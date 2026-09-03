import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const runtime = fs.readFileSync("app/presentation/runtime/phase-action-runtime.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/phase-orb-copy-final.css", "utf8").replace(/\s+/g, " ");
const centeringCss = fs.readFileSync("app/presentation/styles/match-centering-final.css", "utf8").replace(/\s+/g, " ");

test("phase action runtime is mounted", () => {
  assert.match(layout, /import PhaseActionRuntime from "\.\/presentation\/runtime\/phase-action-runtime"/);
  assert.match(layout, /<PhaseActionRuntime \/>/);
});

test("runtime maps current phase actions to the next contextual phase", () => {
  assert.match(runtime, /current: "PRINCIPAL"[\s\S]*next: "COMBATE"/);
  assert.match(runtime, /current: "COMBATE"[\s\S]*next: "FINALIZAÇÃO"/);
  assert.match(runtime, /current: "FINALIZAÇÃO"[\s\S]*next: "ENCERRAR TURNO"/);
  assert.match(runtime, /current: "MANUTENÇÃO"[\s\S]*next: "PRINCIPAL"/);
  assert.match(runtime, /button\.dataset\.phaseNext = action\.next/);
  assert.match(runtime, /button\.dataset\.phaseIcon = action\.icon/);
});

test("phase control is a wide responsive CTA instead of a circular orb", () => {
  assert.match(css, /> \.phase-orb \{[^}]*width: clamp\(8\.2rem, 10\.9cqw, 11\.8rem\) !important[^}]*aspect-ratio: auto !important/);
  assert.match(css, /> \.phase-orb > button \{[^}]*grid-template-columns:[^}]*min-height: clamp\(2\.75rem, 6\.4cqh, 3\.85rem\) !important/);
  assert.match(css, /button::after \{[^}]*content: attr\(data-phase-next\) !important/);
  assert.match(css, /button:not\(:disabled\):hover[^}]*transform: translateY\(-1px\) !important/);
  assert.match(css, /button:disabled[^}]*filter: saturate\(\.24\) brightness\(\.66\) !important/);
});

test("phase action keeps the phase label before the arrow after centering overrides", () => {
  assert.match(centeringCss, /phase-orb > button::after \{[^}]*order: 1 !important/);
  assert.match(centeringCss, /phase-orb > button > span \{[^}]*order: 2 !important/);
});

test("opponent state uses the same plate language and motion respects accessibility", () => {
  assert.match(css, /phase-orb:empty::before[^}]*content: "TURNO DO OPONENTE" !important/);
  assert.doesNotMatch(css, /phase-orb:empty::before[^}]*border-radius: 50% !important/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

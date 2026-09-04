import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/presentation/styles/match-visual-terminal.css", "utf8").replace(/\s+/g, " ");
const criticalCss = fs.readFileSync("app/presentation/styles/critical-flow-feedback.css", "utf8").replace(/\s+/g, " ");
const phaseLegacyCss = fs.readFileSync("app/presentation/styles/phase-orb-copy-final.css", "utf8").replace(/\s+/g, " ");
const pileTextShadowCss = fs.readFileSync("app/presentation/styles/side-pile-text-shadow-terminal.css", "utf8").replace(/\s+/g, " ");
const phaseRuntime = fs.readFileSync("app/presentation/runtime/phase-action-runtime.tsx", "utf8").replace(/\s+/g, " ");

const ruleBody = (sheet, marker) => {
  const start = sheet.indexOf(marker);
  assert.notEqual(start, -1, `missing CSS rule: ${marker}`);
  const open = sheet.indexOf("{", start);
  const close = sheet.indexOf("}", open);
  assert.ok(open >= 0 && close > open, `malformed CSS rule: ${marker}`);
  return sheet.slice(open + 1, close);
};

test("side-pile text shadow remains final for pile styling before scoped hand/tutorial authorities", () => {
  const imports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  const pileIndex = imports.indexOf("./presentation/styles/side-pile-text-shadow-terminal.css");
  const handIndex = imports.indexOf("./presentation/styles/hand-ai-ui-terminal.css");
  const aiIndex = imports.indexOf("./presentation/styles/ai-thinking-panel-terminal.css");
  const tutorialIndex = imports.indexOf("./presentation/styles/tutorial-current-ui-terminal.css");
  assert.ok(pileIndex >= 0);
  assert.ok(handIndex > pileIndex);
  assert.ok(aiIndex > handIndex);
  assert.ok(tutorialIndex > aiIndex);
  assert.equal(imports.at(-1), "./presentation/styles/tutorial-current-ui-terminal.css");
});

test("phase runtime separates current phase hierarchy without replacing gameplay button", () => {
  assert.match(phaseRuntime, /copy\.className = "phase-current-copy"/);
  assert.match(phaseRuntime, /kicker\.className = "phase-current-kicker"[^]*kicker\.textContent = "FASE ATUAL"/);
  assert.match(phaseRuntime, /name\.className = "phase-current-name"/);
  assert.match(phaseRuntime, /orb\.insertBefore\(copy, button\)/);
  assert.match(phaseRuntime, /button\.dataset\.phaseNext = action\.next/);
  assert.match(phaseRuntime, /button\.setAttribute\("aria-label", action\.aria\)/);
  assert.doesNotMatch(phaseRuntime, /button\.onclick\s*=/);
});

test("current phase uses a quiet kicker and stronger phase name", () => {
  assert.match(css, /phase-orb:has\(> button\)::before[^}]*content: none !important[^}]*display: none !important/);

  const kicker = ruleBody(css, ".phase-current-kicker");
  assert.match(kicker, /font-size: clamp\(\.4rem/);
  assert.match(kicker, /font-weight: 850 !important/);
  assert.match(kicker, /letter-spacing: \.18em !important/);

  const name = ruleBody(css, ".phase-current-name");
  assert.match(name, /font-size: clamp\(\.72rem/);
  assert.match(name, /font-weight: 950 !important/);
  assert.match(name, /color: #f6dc8f !important/);
});

test("legacy combined current-phase pseudo-copy is suppressed at matching specificity", () => {
  const imports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  const legacyIndex = imports.indexOf("./presentation/styles/phase-orb-copy-final.css");
  const guardIndex = imports.indexOf("./presentation/styles/critical-flow-feedback.css");

  assert.ok(legacyIndex >= 0);
  assert.ok(guardIndex > legacyIndex);
  assert.match(phaseLegacyCss, /phase-orb:has\(> button\)\[data-phase-current\]::before[^}]*content: "FASE ATUAL · " attr\(data-phase-current\) !important/);
  assert.match(criticalCss, /phase-orb:has\(> button\)\[data-phase-current\]::before[^}]*content: none !important[^}]*display: none !important/);
});

test("player phase CTA width follows the next action copy", () => {
  assert.match(css, /phase-orb:has\(> button\)[^{]*\{[^}]*width: max-content !important/);
  assert.match(css, /phase-orb > button \{[^}]*grid-template-columns: max-content auto !important[^}]*width: max-content !important/);
  assert.match(css, /phase-orb > button::after[^}]*content: attr\(data-phase-next\) !important[^}]*width: max-content !important[^}]*white-space: nowrap !important/);
  assert.doesNotMatch(css, /phase-orb:has\(> button\)[^{]*\{[^}]*width: clamp\(/);
});

test("phase CTA preserves readable long labels without wrapping", () => {
  assert.match(css, /button\[data-phase-next="FINALIZAÇÃO"\]::after[^}]*font-size: clamp\(\.62rem/);
  assert.match(css, /button\[data-phase-next="ENCERRAR TURNO"\]::after[^}]*font-size: clamp\(\.56rem/);
  assert.match(css, /button:not\(\[data-phase-next\]\)::after,[^{]*button\[data-phase-next=""\]::after[^}]*content: "AVANÇAR" !important/);
});

test("phase CTA has no left icon and arrow has no circular plate", () => {
  assert.match(css, /phase-orb > button::before[^}]*content: none !important[^}]*display: none !important/);
  assert.match(css, /phase-orb > button > span[^}]*border: 0 !important[^}]*border-radius: 0 !important[^}]*background: transparent !important[^}]*box-shadow: none !important/);
});

test("phase CTA exposes active, disabled, focus and coarse-pointer states", () => {
  assert.match(css, /button:not\(:disabled\):hover[^}]*border-color:[^}]*filter: brightness\(1\.07\)/);
  assert.match(css, /button:disabled[^}]*cursor: not-allowed !important[^}]*background: linear-gradient[^}]*filter: saturate\(\.24\) brightness\(\.7\)/);
  assert.match(css, /button:focus-visible[^}]*outline:/);
  assert.match(css, /@media \(pointer: coarse\)[^{]*\{[^]*phase-orb > button[^}]*min-height: 2\.75rem !important/);
});

test("real side-pile cards stay shadow-free and legacy panel fades are disabled", () => {
  assert.match(css, /pile-zone > \.pile-card,[^{]*pile-zone > \.pile-card > :is\(\.remote-card-art, canvas, img\)[^}]*box-shadow: none !important[^}]*filter: none !important/);
  assert.match(pileTextShadowCss, /pile-zone:has\(> \.pile-card > \.remote-card-art\)::after,[^]*content: none !important[^}]*display: none !important[^}]*background: none !important/);
});

test("side-pile readability shadow follows label and count bounds", () => {
  const footer = ruleBody(pileTextShadowCss, ".pile-zone > :is(b, strong)");
  assert.match(footer, /display: inline-flex !important/);
  assert.match(footer, /width: max-content !important/);
  assert.match(footer, /align-self: end !important/);
  assert.match(footer, /background: linear-gradient/);
  assert.match(footer, /box-shadow:/);
  assert.match(pileTextShadowCss, /pile-zone > b[^}]*justify-self: start !important/);
  assert.match(pileTextShadowCss, /pile-zone > strong[^}]*justify-self: end !important/);
});

test("graveyard top card remains neutral full bleed without crop or zoom", () => {
  assert.match(css, /pile-zone\.grave > \.pile-card[^}]*transform: none !important[^}]*scale: 1 !important/);
  assert.match(css, /pile-zone\.grave > \.pile-card > :is\(\.remote-card-art, canvas, img\)[^}]*transform: none !important[^}]*scale: 1 !important[^}]*object-fit: cover !important[^}]*object-position: center center !important/);
  assert.doesNotMatch(css, /transform: scale\(1\.(?:48|52)\)/);
});

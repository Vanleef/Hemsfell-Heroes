import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  aiRuntime,
  livenessRuntime,
  interactionRuntime,
  memoryRuntime,
  runtimeGate,
  cardArt,
  stabilityCss,
  iconCss,
] = await Promise.all([
  read("app/rules-engine/ai-system/runtime.ts"),
  read("app/presentation/runtime/presentation-liveness-runtime.tsx"),
  read("app/presentation/runtime/presentation-interaction-runtime.tsx"),
  read("app/presentation/runtime/presentation-memory-runtime.tsx"),
  read("app/presentation/runtime/match-runtime-gate.tsx"),
  read("app/presentation/cards/remote-card-art.tsx"),
  read("app/presentation/styles/card-interaction-stability-terminal.css"),
  read("app/presentation/styles/mobile-card-icon-scale-terminal.css"),
]);

test("authoritative AI decisions never fall through to strategic MCTS", () => {
  const decisionFunction = aiRuntime.match(/export async function chooseAdvancedAIDecision[\s\S]*?\n}\n\nexport function planAdvancedAIAttacks/)?.[0] || "";
  assert.match(decisionFunction, /chooseAIDecision\(/);
  assert.match(decisionFunction, /deterministicDecisionFallback/);
  assert.doesNotMatch(decisionFunction, /chooseAdvancedAIAction\(/);
  assert.match(aiRuntime, /pending\.kind === "choice-target" && pending\.effect\?\.optional/);
});

test("stale presentation locks recover without waiting for an AI callback", () => {
  assert.match(livenessRuntime, /MAX_PRESENTATION_LOCK_MS = 9000/);
  assert.match(livenessRuntime, /hemsfell:presentation-catch-up/);
  assert.match(livenessRuntime, /__hemsfellPresentationBusy/);
  assert.match(runtimeGate, /PresentationLivenessRuntime/);
});

test("response dialogs remain deferred until presentation becomes idle", () => {
  assert.match(interactionRuntime, /DEFERRED_RESPONSE_SELECTOR/);
  assert.match(interactionRuntime, /hhDeferredByPresentation/);
  assert.match(interactionRuntime, /node\.hidden = true/);
  assert.match(interactionRuntime, /syncDeferredResponseUi\(active\)/);
  assert.match(stabilityCss, /html\.hh-presentation-locked body \.screen-game :is\(\.response-overlay,\.response-waiting\)/);
  assert.match(stabilityCss, /data-hh-deferred-by-presentation="true"/);
});

test("detached presentation canvases release native backing stores", () => {
  assert.match(memoryRuntime, /if \(canvas\.isConnected\) return/);
  assert.match(memoryRuntime, /canvas\.width = 0/);
  assert.match(memoryRuntime, /canvas\.height = 0/);
  assert.match(memoryRuntime, /record\.removedNodes\.forEach\(collect\)/);
  assert.match(runtimeGate, /PresentationMemoryRuntime/);
});

test("PDF page resources are cleaned after the final concurrent raster", () => {
  assert.match(cardArt, /activePageRenders = new Map/);
  assert.match(cardArt, /pdfPage\.cleanup\(\)/);
  assert.match(cardArt, /MAX_CACHED_PAGE_PROMISES = 12/);
  assert.match(cardArt, /isMemoryConstrainedDevice\(\) \? 8 : MAX_CACHED_PAGE_PROMISES/);
  assert.match(cardArt, /cleanupPdfDocumentResources\(\)/);
});

test("desktop card icons grow while coarse mobile caps stay compact", () => {
  assert.match(iconCss, /@media \(hover: hover\) and \(pointer: fine\) and \(min-width: 56rem\)/);
  assert.match(iconCss, /width: clamp\(\.68rem, 15\.5cqi, 1\.04rem\)/);
  assert.match(iconCss, /width: clamp\(\.82rem, 18cqi, 1\.18rem\)/);
  assert.match(iconCss, /@media \(orientation: landscape\) and \(hover: none\) and \(pointer: coarse\)/);
  assert.match(iconCss, /width: clamp\(\.4rem, 9\.5cqi, \.64rem\)/);
  assert.match(iconCss, /width: clamp\(\.68rem, 15cqi, \.98rem\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("presentation runtimes are mounted after card preview and before the game page", () => {
  const layout = read("app/layout.tsx");
  const glossary = layout.indexOf("<GameGlossaryRuntime />");
  const preview = layout.indexOf("<CardPreviewRuntime />");
  const bridge = layout.indexOf("<PresentationEventBridge />");
  const interaction = layout.indexOf("<PresentationInteractionRuntime />");
  const runtime = layout.indexOf("<GamePresentationRuntime />");
  const children = layout.indexOf("{children}");
  assert.ok(glossary >= 0 && preview > glossary && bridge > preview && interaction > bridge && runtime > interaction && children > runtime);
  assert.doesNotMatch(layout, /GameActionCuesRuntime/);
  assert.ok(layout.indexOf('import "./game-presentation.css"') < layout.indexOf('import "./command-bar-fixes.css"'));
});

test("canonical glossary feeds the legacy semantic spans used by card preview", () => {
  const glossary = read("app/game-glossary.ts");
  const runtime = read("app/game-glossary-runtime.tsx");
  assert.match(glossary, /export function gameGlossaryEntry/);
  assert.match(runtime, /import \{ gameGlossaryEntry \} from "\.\/game-glossary"/);
  assert.match(runtime, /\.keyword-term,\.keyword-badge,\[data-keyword\],\[data-status\]/);
  assert.match(runtime, /element\.dataset\.tip = entry\.description/);
  assert.match(runtime, /element\.dataset\.glossaryTone = entry\.tone/);
  assert.match(runtime, /element\.removeAttribute\("title"\)/);
});

test("rules core stays isolated behind a browser instrumentation facade", () => {
  const facade = read("app/rules-engine/engine.mjs");
  const core = read("app/rules-engine/engine-core.mjs");
  assert.match(facade, /executeCommand as executeCore/);
  assert.match(facade, /export \* from "\.\/engine-core\.mjs"/);
  assert.match(facade, /typeof window !== "undefined"/);
  assert.match(facade, /options\?\.presentation === true/);
  assert.doesNotMatch(facade, /queueMicrotask|pending\s*=\s*new Map|flushScheduled/);
  assert.match(facade, /hemsfell:rules-command-resolved/);
  assert.match(core, /export function executeCommand\(/);
  assert.doesNotMatch(core, /hemsfell:presentation-action|hemsfell:rules-command-resolved|__hemsfellPresentationBusy/);
});

test("presentation bridge deduplicates material transitions and recovers resolved combat once", () => {
  const bridge = read("app/presentation-event-bridge.tsx");
  for (const command of ["declareAttack", "selectDefender", "reposition", "confirmReposition", "surrender"]) {
    assert.match(bridge, new RegExp(`\\"${command}\\"`));
  }
  assert.match(bridge, /MAX_SEEN_TRANSITIONS = 256/);
  assert.match(bridge, /seenTransitionKeys/);
  assert.match(bridge, /transitionKey\(base\)/);
  assert.match(bridge, /single-attack-resolution/);
  assert.match(bridge, /attackFromCombat/);
  assert.match(bridge, /type: "attack"/);
  assert.match(bridge, /hasPresentableDelta/);
  assert.match(bridge, /response\.ok && data\?\.game/);
  assert.match(bridge, /onlineSnapshot/);
  assert.match(bridge, /hemsfell:online-room-snapshot/);
  assert.match(bridge, /hemsfell:presentation-action/);
});

test("guest online presentation mirrors nested priority ownership", () => {
  const bridge = read("app/presentation-event-bridge.tsx");
  assert.match(bridge, /const flipOwner/);
  assert.match(bridge, /pendingAction = \{ \.\.\.clone\(game\.pendingAction\), owner: flipOwner/);
  assert.match(bridge, /priorityStack = game\.priorityStack\.map/);
  assert.match(bridge, /owner: flipOwner\(frame\.command\.owner\)/);
  assert.match(bridge, /responder: flipOwner\(game\.pendingResponse\.responder\)/);
});

test("AI keeps its original runtime shape and waits for the single presentation transaction", () => {
  const runtime = read("app/rules-engine/ai-system/runtime.ts");
  assert.equal(existsSync(new URL("../app/rules-engine/ai-system/runtime-core.ts", import.meta.url)), false);
  assert.match(runtime, /controllerFor\(owner, difficulty\)\.planAttacks\(state, owner\)\.map/);
  assert.match(runtime, /__hemsfellPresentationBusy/);
  assert.match(runtime, /hemsfell:presentation-idle/);
  assert.doesNotMatch(runtime, /PresentationCueBusy|presentation-cue/);
  assert.match(runtime, /PRESENTATION_IDLE_FAILSAFE_MS = 20000/);
  assert.match(runtime, /export async function chooseAdvancedAIAction[\s\S]*await waitForPresentationIdle\(\)/);
  assert.match(runtime, /export async function chooseAdvancedAIResponse[\s\S]*await waitForPresentationIdle\(\)/);
  assert.match(runtime, /const PRIORITY_HARD_TIMEOUT_MS = 850/);
  assert.match(runtime, /boundedPrioritySearch\(chooseAdvancedAIAction/);
});

test("player interaction is blocked for the full presentation lifetime", () => {
  const runtime = read("app/presentation-interaction-runtime.tsx");
  assert.match(runtime, /__hemsfellPresentationBusy/);
  assert.doesNotMatch(runtime, /PresentationCueBusy|presentation-cue/);
  assert.match(runtime, /pointerdown/);
  assert.match(runtime, /dragstart/);
  assert.match(runtime, /keydown/);
  assert.match(runtime, /event\.stopImmediatePropagation\(\)/);
  assert.match(runtime, /hh-presentation-locked/);
  assert.match(runtime, /aria-busy/);
});

test("combat and targeted effects have explicit one-shot visual cues", () => {
  const runtime = read("app/presentation-action-cues.ts");
  assert.match(runtime, /hh-combat-sword/);
  assert.match(runtime, /hh-effect-orb/);
  assert.match(runtime, /animateActionCue/);
  assert.match(runtime, /animateSword\(layer, cue\.attacker, clash\)/);
  assert.match(runtime, /animateSword\(layer, cue\.defender, clash/);
  assert.match(runtime, /animateSword\(layer, cue\.attacker, cue\.hero\)/);
  assert.match(runtime, /animateMagicProjectile/);
  assert.match(runtime, /canInferTargets/);
  assert.match(runtime, /uniqueRects/);
});

test("presentation runtime serializes confirmed before-after clips and exposes pacing signals", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(runtime, /const afterReactCommit = nextFrame/);
  assert.match(runtime, /installArrivalGate\(detail\)/);
  assert.match(runtime, /__hemsfellPresentationBusy/);
  assert.match(runtime, /hemsfell:presentation-busy/);
  assert.match(runtime, /hemsfell:presentation-idle/);
  assert.match(runtime, /seenPresentationIds/);
  assert.match(runtime, /captureActionCue/);
  assert.match(runtime, /await animateActionCue/);
  assert.match(runtime, /await presentDeltas/);
  assert.match(runtime, /await Promise\.all\(completion\)/);
  assert.match(runtime, /if \(!detail\?\.before \|\| !detail\?\.after \|\| !detail\?\.command/);
  assert.match(runtime, /MAX_FLIGHTS = 8/);
});

test("presentation CSS dims the hand while locked and styles combat/effect cues", () => {
  const css = read("app/game-presentation.css");
  assert.match(css, /html\.hh-presentation-locked \.screen-game \.player-hand/);
  assert.match(css, /cursor: not-allowed/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\.hh-combat-sword/);
  assert.match(css, /\.hh-effect-orb/);
  assert.match(css, /\.hh-cue-impact\.is-combat/);
  assert.match(css, /\.hh-cue-impact\.is-magic/);
  assert.doesNotMatch(css, /hh-action-cue-layer/);
  for (const kind of ["fx-summon", "fx-spell", "fx-artifact", "fx-terrain"]) assert.match(css, new RegExp(`visual-effect\\.${kind}`));
  assert.doesNotMatch(css, /visual-effect\.fx-ability\s*\{/);
  assert.doesNotMatch(css, /visual-effect\.fx-damage\s*\{/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("PR1 does not introduce temporary scripts or workflows", () => {
  const workflows = readdirSync(new URL("../.github/workflows", import.meta.url));
  const scripts = readdirSync(new URL("../scripts", import.meta.url));
  assert.equal(workflows.some((name) => /^tmp[-_.]/i.test(name)), false);
  assert.equal(scripts.some((name) => /^tmp[-_.]/i.test(name)), false);
});

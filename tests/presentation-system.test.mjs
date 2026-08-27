import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("presentation runtime is mounted after card preview and before the game page", () => {
  const layout = read("app/layout.tsx");
  const preview = layout.indexOf("<CardPreviewRuntime />");
  const bridge = layout.indexOf("<PresentationEventBridge />");
  const runtime = layout.indexOf("<GamePresentationRuntime />");
  const children = layout.indexOf("{children}");
  assert.ok(preview >= 0 && bridge > preview && runtime > bridge && children > runtime);
  assert.ok(layout.indexOf('import "./game-presentation.css"') < layout.indexOf('import "./command-bar-fixes.css"'));
});

test("rules core stays isolated behind a browser instrumentation facade", () => {
  const facade = read("app/rules-engine/engine.mjs");
  const core = read("app/rules-engine/engine-core.mjs");
  assert.match(facade, /executeCommand as executeCore/);
  assert.match(facade, /export \* from "\.\/engine-core\.mjs"/);
  assert.match(facade, /typeof window !== "undefined"/);
  assert.match(facade, /hemsfell:rules-command-resolved/);
  assert.match(core, /export function executeCommand\(/);
  assert.doesNotMatch(core, /hemsfell:presentation-action|hemsfell:rules-command-resolved|__hemsfellPresentationBusy/);
});

test("presentation bridge only stages material confirmed actions and keeps combat interaction external", () => {
  const bridge = read("app/presentation-event-bridge.tsx");
  for (const command of ["declareAttack", "selectDefender", "attack", "reposition", "confirmReposition", "surrender"]) {
    assert.match(bridge, new RegExp(`\\"${command}\\"`));
  }
  assert.match(bridge, /hasPresentableDelta/);
  assert.match(bridge, /command\?\.type !== "passPriority"/);
  assert.match(bridge, /before\?\.pendingResponse\?\.passes/);
  assert.match(bridge, /stack\.at\(-1\)\?\.command/);
  assert.match(bridge, /before\?\.pendingAction/);
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

test("presentation runtime serializes confirmed before-after clips and exposes pacing signals", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(runtime, /await nextFrame\(\); await nextFrame\(\)/);
  assert.match(runtime, /__hemsfellPresentationBusy/);
  assert.match(runtime, /hemsfell:presentation-busy/);
  assert.match(runtime, /hemsfell:presentation-idle/);
  assert.match(runtime, /seenCommandIds/);
  assert.match(runtime, /if \(!detail\?\.before \|\| !detail\?\.after \|\| !detail\?\.command/);
  assert.match(runtime, /MAX_FLIGHTS = 8/);
});

test("ordinary play overlays are retired while ability and damage theatre remains available", () => {
  const css = read("app/game-presentation.css");
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

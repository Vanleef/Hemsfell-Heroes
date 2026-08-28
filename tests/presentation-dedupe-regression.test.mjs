import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("effect cues have one semantic target owner", () => {
  const runtime = read("app/presentation-action-cues.ts");
  assert.match(runtime, /"onlineSnapshot"/);
  assert.match(runtime, /explicit\.length \? explicit/);
  assert.match(runtime, /inferred\.length <= MAX_TARGETS/);
  assert.match(runtime, /excludedIds\.has\(id\)/);
  assert.match(runtime, /uniqueRects/);
  assert.match(runtime, /canInferTargets/);
  assert.doesNotMatch(runtime, /\[\.\.\.explicitTargetRects\(detail\), \.\.\.changedTargetRects\(detail\)\]/);
});

test("one runtime owns motion, combat cues, effects and numeric deltas", () => {
  const layout = read("app/layout.tsx");
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.doesNotMatch(layout, /GameActionCuesRuntime/);
  assert.match(runtime, /const arrivals = flights\.filter/);
  assert.match(runtime, /const departures = flights\.filter/);
  assert.match(runtime, /cue\?\.kind === "combat"/);
  assert.match(runtime, /cue\?\.kind === "effect"/);
  assert.match(runtime, /await presentDeltas/);
});

test("presentation identity is assigned once by the bridge and reused by the runtime", () => {
  const bridge = read("app/presentation-event-bridge.tsx");
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(bridge, /const presentationId = transitionKey\(base\)/);
  assert.match(bridge, /\.\.\.base, presentationId/);
  assert.match(runtime, /detail\.presentationId/);
  assert.match(runtime, /seenPresentationIds/);
});

test("blocking child animations are ordered while readable damage gates visual state commit", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(runtime, /await Promise\.all\(\[movement, \.\.\.ambient\]\)/);
  assert.match(runtime, /await Promise\.all\(completion\)/);
  assert.match(runtime, /const completion = Promise\.all\(labels\)/);
  assert.match(runtime, /if \(settle\) await completion/);
  assert.doesNotMatch(runtime, /flight\.targets\?\.forEach\(\(target\) => effectBeam/);
  assert.match(runtime, /const heldState = holdChangedState/);
  assert.match(runtime, /releaseReadableState\(heldState\)/);
  assert.match(runtime, /await presentDeltas[\s\S]*finally \{\s*releaseChangedState\(heldState\)/);
  assert.ok(runtime.indexOf("await presentDeltas") < runtime.indexOf("releaseChangedState(heldState)"));
});

test("only an authoritative local command may publish a presentation transition", () => {
  const facade = read("app/rules-engine/engine.mjs");
  const page = read("app/page.tsx");
  const controller = read("app/rules-engine/ai-system/controller.ts");
  const combat = read("app/rules-engine/combat.mjs");

  assert.match(facade, /options\?\.presentation === true/);
  assert.match(page, /\{priority:true,presentation:true\}/);
  assert.match(controller, /from "\.\.\/engine-core\.mjs"/);
  assert.match(combat, /from "\.\/engine-core\.mjs"/);
  assert.doesNotMatch(controller, /from "\.\.\/engine\.mjs"/);
  assert.doesNotMatch(combat, /from "\.\/engine\.mjs"/);
});

test("simulated engine commands stay silent while one opted-in command emits synchronously once", async () => {
  const emitted = [];
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.window = { dispatchEvent: (event) => emitted.push(event) };
  globalThis.CustomEvent = class {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };

  try {
    const { executeCommand } = await import("../app/rules-engine/engine.mjs");
    const state = () => ({
      active: 0,
      phase: "fim",
      round: 1,
      players: [0, 1].map(() => ({
        life: 30, maxLife: 30, energy: 0, maxEnergy: 5, reserve: 0,
        deck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [],
      })),
    });

    for (let index = 0; index < 10; index++) {
      executeCommand(state(), { type: "advancePhase", owner: 0 }, { priority: false });
    }
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.equal(emitted.length, 0);

    executeCommand(state(), { type: "advancePhase", owner: 0 }, { priority: false, presentation: true });
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].type, "hemsfell:rules-command-resolved");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});

test("interactive card results stay behind the complete presentation barrier", () => {
  const page = read("app/page.tsx");
  const facade = read("app/rules-engine/engine.mjs");

  assert.match(page, /presentationBlocked=presentationBusy\|\|!!visualFx\|\|visualFxQueue\.length>0\|\|shufflingDeck!==null/);
  assert.match(page, /visibleResponseWindow=presentationBlocked\?null:responseWindow/);
  assert.match(page, /engineDecision=presentationBlocked\?null:game\?\.pendingDecision/);
  assert.match(page, /!presentationBlocked&&searchChoice&&<SearchDeckModal/);
  assert.match(page, /!presentationBlocked&&!!game\?\.pendingReposition/);
  const css = read("app/game-presentation.css");
  for (const resultUi of ["engine-decision-backdrop", "response-overlay", "search-deck-overlay"]) {
    assert.match(css, new RegExp(`html\\.hh-presentation-locked[\\s\\S]*${resultUi}`));
  }
  assert.doesNotMatch(facade, /queueMicrotask|pending\s*=\s*new Map|flushScheduled/);
  assert.match(facade, /window\.dispatchEvent\(new CustomEvent\(RULES_RESOLVED_EVENT/);
});

test("resolved combat has a single visual owner", () => {
  const css = read("app/game-presentation.css");
  assert.match(css, /\.combat-cinematic\.stage-charging/);
  assert.match(css, /\.combat-cinematic\.stage-impact/);
  assert.match(css, /\.combat-cinematic\.stage-resolved/);
});

test("presentation bridge ignores bookkeeping-only updates", () => {
  const bridge = read("app/presentation-event-bridge.tsx");
  const start = bridge.indexOf("const presentationFingerprint");
  const end = bridge.indexOf("const hasPresentableDelta");
  const fingerprint = bridge.slice(start, end);
  assert.doesNotMatch(fingerprint, /\bround:|\bphase:|\bactive:|\bevents:/);
  assert.match(fingerprint, /\bwinner:/);
  assert.match(fingerprint, /\bplayers:/);
});

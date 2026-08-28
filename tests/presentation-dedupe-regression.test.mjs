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

test("child animations are awaited before presentation idle", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(runtime, /await Promise\.all\(\[movement, \.\.\.ambient\]\)/);
  assert.match(runtime, /await Promise\.all\(completion\)/);
  assert.match(runtime, /await Promise\.all\(labels\)/);
  assert.doesNotMatch(runtime, /flight\.targets\?\.forEach\(\(target\) => effectBeam/);
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

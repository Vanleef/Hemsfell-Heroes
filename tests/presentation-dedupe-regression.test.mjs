import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("effect cues have one semantic target owner", () => {
  const runtime = read("app/game-action-cues-runtime.tsx");
  assert.match(runtime, /command\.type === "onlineSnapshot"/);
  assert.match(runtime, /explicit\.length \? explicit/);
  assert.match(runtime, /inferred\.length === 1/);
  assert.match(runtime, /excludedIds\.has\(id\)/);
  assert.match(runtime, /uniqueRects/);
  assert.match(runtime, /visual-effect\.fx-ability/);
  assert.doesNotMatch(runtime, /\[\.\.\.explicitTargetRects\(detail\), \.\.\.changedTargetRects\(detail\)\]/);
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

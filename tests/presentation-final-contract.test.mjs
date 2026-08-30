import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("direct Hero attack is sword-only before the red life delta", () => {
  const cues = read("app/presentation/cues/presentation-action-cues.ts");
  const runtime = read("app/presentation/runtime/game-presentation-runtime.tsx");
  const heroStart = cues.indexOf("if (cue.hero) {");
  const heroEnd = cues.indexOf("\n  }", heroStart);
  const heroCue = cues.slice(heroStart, heroEnd);
  assert.match(heroCue, /await animateSword/);
  assert.doesNotMatch(heroCue, /impact\(/);
  assert.match(runtime, /directHeroAttack \? Promise\.resolve\(\) : animateHeroShake/);
  assert.match(runtime, /await presentDeltas/);
});

test("level-up and visible card state stay behind the shared presentation barrier", () => {
  const runtime = read("app/presentation/runtime/game-presentation-runtime.tsx");
  const page = read("app/page.tsx");
  const bridge = read("app/presentation/runtime/presentation-event-bridge.tsx");
  const presentationState = read("app/presentation/state/presentation-state.ts");
  assert.match(runtime, /unitPresentationFingerprint/);
  assert.match(runtime, /await animateHeroLevelUp\(layers\.effect, detail, afterDom, heldState\)/);
  assert.match(runtime, /setBusy\(true\)/);
  assert.match(page, /__hemsfellPresentationBusy/);
  assert.match(bridge, /presentationTransitionKey/);
  assert.match(presentationState, /level: player\?\.level/);
});

test("presentation snapshot refresh ignores unrelated UI mutations", () => {
  const runtime = read("app/presentation/runtime/game-presentation-runtime.tsx");
  assert.match(runtime, /mutationTouchesPresentationState/);
  assert.match(runtime, /target\.closest\("\.hh-motion-layer,\.hh-effect-layer"\)/);
  assert.match(runtime, /stableDom = afterDom/);
});

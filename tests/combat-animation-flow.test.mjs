import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// These regressions intentionally encode what the player is allowed to see, not just final engine state.
test("spell presentation follows entry target impact damage cleanup death order", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const start = runtime.indexOf("if (spellFlight) {");
  const end = runtime.indexOf("} else if (cue?.kind === \"combat\")", start);
  const flow = runtime.slice(start, end);
  const entry = flow.indexOf("await animateSpellEntry");
  const target = flow.indexOf("await animateSpellTargeting");
  const impact = flow.indexOf("await animateSpellImpact");
  const damage = flow.indexOf("await presentDeltas");
  const cleanup = flow.indexOf("await animateSpellExit");
  const death = flow.indexOf("releaseDepartureHold");
  assert.ok(entry >= 0 && entry < target && target < impact && impact < damage && damage < cleanup && cleanup < death);
});

test("changed stats stay visually old until damage number becomes readable", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(runtime, /holdStateVisual\(layer, fresh\.element, old\.clone, old\.rect/);
  assert.match(runtime, /if \(!labels\.length\) \{ onReadable\(\); return; \}/);
  assert.match(runtime, /window\.setTimeout\(resolve, prefersReducedMotion\(\) \? 35 : 135\)/);
  assert.match(runtime, /onReadable\(\);/);
  assert.match(runtime, /releaseReadableState\(heldState\)/);
});

test("lethal targets remain on board until their ordered departure starts", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(runtime, /if \(after\.units\.has\(uid\)\) continue;/);
  assert.match(runtime, /deferredDeath/);
  assert.match(runtime, /releaseDepartureHold\(heldState, flight\.uid\)/);
  assert.match(runtime, /afterDom\.units\.get\(id\)\?\.rect \|\| beforeDom\.units\.get\(id\)\?\.rect/);
});

test("direct hero damage only shakes the anchored presentation clone", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const start = runtime.indexOf("async function animateHeroShake");
  const end = runtime.indexOf("async function floatingLabel", start);
  const shake = runtime.slice(start, end);
  assert.match(shake, /translate3d\(-3px,1px,0\)/);
  assert.match(shake, /translate3d\(3px,-1px,0\)/);
  assert.doesNotMatch(shake, /style\.(left|top)\s*=/);
  assert.doesNotMatch(shake, /append\(|remove\(\)/);
});

test("spell flights are physically deduplicated and AI combat waits for presentation idle", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const page = read("app/page.tsx");
  assert.match(runtime, /const seenFlights = new Set<string>\(\)/);
  assert.match(runtime, /if \(seenFlights\.has\(key\)\) return false/);
  assert.match(page, /combatAction\|\|pending\|\|presentationBusy/);
  assert.match(page, /responseWindow\|\|presentationBusy\)return/);
  assert.match(page, /aiAttackQueue,presentationBusy/);
});

test("presentation CSS exposes dedicated target, impact and hero feedback layers", () => {
  const css = read("app/game-presentation.css");
  assert.match(css, /\.hh-target-reticle/);
  assert.match(css, /\.hh-spell-impact/);
  assert.match(css, /\.hh-state-hold\.is-deferred-death/);
  assert.match(css, /\.hh-hero-impact/);
});
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
  assert.match(shake, /querySelector<HTMLElement>\("\.hero-power-trigger"\)/);
  assert.match(shake, /translateX\(-2\.5px\)/);
  assert.match(shake, /translateX\(2\.5px\)/);
  assert.doesNotMatch(shake, /translate3d\(/);
  assert.doesNotMatch(shake, /scale\(/);
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

// Damage presentation clones must keep field-scale stats and an anchored Hero portrait.
test("presentation clones preserve live stat badge geometry", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const css = read("app/game-presentation.css");
  assert.match(runtime, /function freezePresentationCardMetrics/);
  assert.match(runtime, /live-atk.*live-hp/);
  assert.match(runtime, /freezePresentationCardMetrics\(element, clone\)/);
  assert.match(runtime, /"is-impacting"/);
  assert.match(css, /\.hh-flight-face :is\(\.live-atk, \.live-hp\)/);
  assert.match(css, /animation: none !important/);
});

test("command bar caps remain compact at large viewport sizes", () => {
  const css = read("app/command-bar-fixes.css");
  assert.match(css, /font-size:clamp\(\.74rem,min\(\.88vw,1\.56dvh\),\.92rem\)!important/);
  assert.match(css, /font-size:clamp\(\.62rem,min\(\.72vw,1\.28dvh\),\.74rem\)!important/);
  assert.match(css, /font-size:clamp\(\.7rem,min\(\.8vw,1\.42dvh\),\.86rem\)!important/);
  assert.match(css, /font-size:clamp\(\.66rem,min\(\.74vw,1\.32dvh\),\.8rem\)!important/);
});

test("legacy hero-hurt fallback uses only the tiny translate shake", () => {
  const css = read("app/ui-overrides.css");
  assert.match(css, /player-hero\.hero-hurt>\.hero-power-trigger\{animation:heroDamagePulse \.18s ease-out both\}/);
  const start = css.indexOf("@keyframes heroDamagePulse");
  const end = css.indexOf("@keyframes heroDamageFlash", start);
  const pulse = css.slice(start, end);
  assert.match(pulse, /translateX\(-2\.5px\)/);
  assert.match(pulse, /translateX\(2\.5px\)/);
  assert.doesNotMatch(pulse, /scale\(/);
  assert.doesNotMatch(pulse, /translateX\([^)]*%/);
});

test("command bar runtime uses the same compact caps as the stylesheet", () => {
  const runtime = read("app/match-ui-runtime.tsx");
  assert.match(runtime, /COMMAND_TITLE_SIZE = "clamp\(\.62rem,min\(\.72vw,1\.28dvh\),\.74rem\)"/);
  assert.match(runtime, /COMMAND_COPY_SIZE = "clamp\(\.74rem,min\(\.88vw,1\.56dvh\),\.92rem\)"/);
  assert.match(runtime, /COMMAND_COMPACT_COPY_SIZE = "clamp\(\.7rem,min\(\.8vw,1\.42dvh\),\.86rem\)"/);
  assert.match(runtime, /COMMAND_DENSE_COPY_SIZE = "clamp\(\.66rem,min\(\.74vw,1\.32dvh\),\.8rem\)"/);
});

test("turned cards omit the VIRADA plate while presenting effects", () => {
  const page = read("app/page.tsx");
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(page, /unit\.exhausted&&!activeEffect&&!unit\.impacting/);
  assert.match(runtime, /toUpperCase\(\) === "VIRADA"/);
});

test("opponent plays reveal their actual face at the start of presentation", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const art = read("app/remote-card-art.tsx");
  const bridge = read("app/presentation-event-bridge.tsx");
  assert.match(art, /export async function renderRemoteCardArtToCanvas/);
  assert.match(runtime, /async function revealOpponentPlayedCard/);
  assert.match(runtime, /owner !== 1/);
  assert.match(runtime, /fallbackOpponentSource/);
  assert.match(runtime, /sourcePlay: true/);
  const reveal = runtime.indexOf("await revealOpponentPlayedCard(detail, flights)");
  const spell = runtime.indexOf("const spellFlight = flights.find", reveal);
  assert.ok(reveal >= 0 && reveal < spell);
  assert.match(bridge, /const inferOpponentPlayCommand/);
  assert.match(bridge, /presentationCard: clone\(candidate\)/);
  assert.match(bridge, /combatCommand \|\| opponentPlayCommand \|\|/);
});

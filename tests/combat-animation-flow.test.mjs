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
  assert.match(runtime, /FloatingLabelLifecycle/);
  assert.match(runtime, /await Promise\.all\(labels\.map\(\(label\) => label\.readable\)\)/);
  assert.doesNotMatch(runtime, /setTimeout\(resolve, prefersReducedMotion\(\) \? 35 : 135\)/);
  assert.match(runtime, /completion: Promise\.all\(labels\.map\(\(label\) => label\.finished\)\)/);
  assert.match(runtime, /releaseReadableState\(heldState\)/);
});

test("lethal targets remain on board until their ordered departure starts", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(runtime, /if \(after\.units\.has\(uid\)\) continue;/);
  assert.match(runtime, /deferredDeath/);
  assert.match(runtime, /releaseDepartureHold\(heldState, flight\.uid\)/);
  assert.match(runtime, /afterDom\.units\.get\(id\)\?\.rect \|\| beforeDom\.units\.get\(id\)\?\.rect/);
});

test("direct hero attacks use only sword travel plus the red life delta", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const cues = read("app/presentation-action-cues.ts");
  const heroCueStart = cues.indexOf("if (cue.hero) {");
  const heroCue = cues.slice(heroCueStart, cues.indexOf("}", heroCueStart) + 1);
  assert.match(heroCue, /await animateSword/);
  assert.doesNotMatch(heroCue, /impact\(/);
  const combatStart = runtime.indexOf('} else if (cue?.kind === "combat")');
  const combatEnd = runtime.indexOf('} else {', combatStart);
  const combat = runtime.slice(combatStart, combatEnd);
  assert.match(combat, /const directHeroAttack = !!cue\.hero && !cue\.defender/);
  assert.match(combat, /directHeroAttack \? Promise\.resolve\(\) : animateHeroShake/);
  assert.match(combat, /await presentDeltas/);
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


// Direct damage must never animate or replace the Hero portrait itself.
test("legacy hero-hurt fallback cannot move or scale the Hero portrait", () => {
  const css = read("app/ui-overrides.css");
  assert.match(css, /player-hero\.hero-hurt>\.hero-power-trigger\{animation:none!important;transform:none!important;transition:none!important\}/);
  assert.doesNotMatch(css, /@keyframes heroDamagePulse/);
});

test("Hero damage holds only the life badge instead of cloning the Hero portrait", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const css = read("app/game-presentation.css");
  assert.match(runtime, /function holdHeroLifeVisual/);
  assert.match(runtime, /fresh\.lifeElement, old\.life, old\.lifeRect/);
  assert.match(runtime, /Damage feedback must never replace the Hero portrait/);
  assert.match(css, /\.hh-hero-life-hold \{/);
  assert.match(css, /transform: none !important/);
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


test("spell and ability state cannot become visible before their presentation cue", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(runtime, /const unitPresentationFingerprint/);
  assert.match(runtime, /holdChangedState\(layers\.motion, beforeDom, afterDom, detail\)/);
  assert.match(runtime, /unitPresentationFingerprint\(oldState\) === unitPresentationFingerprint\(freshState\)/);
  assert.match(runtime, /changedTargetRects\(detail, beforeDom, afterDom\)/);
  assert.match(runtime, /!visual\.deferredDeath && !visual\.levelUp/);
});

test("hero level-up is a central blocking presentation stage in every mode", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const css = read("app/game-presentation.css");
  const page = read("app/page.tsx");
  const bridge = read("app/presentation-event-bridge.tsx");
  assert.match(runtime, /async function animateHeroLevelUp/);
  assert.match(runtime, /await animateHeroLevelUp\(layers\.effect, detail, afterDom, heldState\)/);
  assert.match(runtime, /releaseLevelState\(held, hero\?\.element\)/);
  assert.match(css, /\.hh-hero-level-up \{/);
  assert.match(page, /const queueOnlineSnapshotFx=\(_previous:Game\|null,_next:Game\)=>\{\};/);
  assert.match(bridge, /level: player\?\.level/);
});

test("AI and online follow-up commands respect presentation idle", () => {
  const page = read("app/page.tsx");
  assert.match(page, /__hemsfellPresentationBusy\?\:boolean\}\)\.__hemsfellPresentationBusy\)return false/);
  assert.match(page, /presentationBusy\|\|mode!=="bot"\|\|!decision/);
  assert.match(page, /if\(!game\|\|presentationBusy\|\|game\.active!==1/);
  assert.match(page, /if\(incomingRevision<=roomRevisionRef\.current\)return;announceOnlineSnapshot/);
});

test("presentation snapshot maintenance ignores unrelated UI churn", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(runtime, /const mutationTouchesPresentationState = \(record: MutationRecord\)/);
  assert.match(runtime, /Ignore clocks, logs and unrelated UI churn/);
  assert.match(runtime, /stableDom = afterDom;/);
});


test("presentation busy releases from animation completion instead of wall-clock holds", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const page = read("app/page.tsx");
  assert.doesNotMatch(runtime, /window\.setTimeout/);
  assert.match(runtime, /await deltaCompletion/);
  assert.doesNotMatch(page, /VISUAL_FX_HOLD_MS|COMBAT_STAGE_DELAY_MS/);
  assert.match(page, /useFiniteVisualCompletion/);
  assert.match(page, /getAnimations\(\{subtree:true\}\)/);
  assert.match(page, /const frame=requestAnimationFrame\(\(\)=>\{/);
  assert.doesNotMatch(page, /setShufflingDeck\(current=>current===owner\?null:current\),4000/);
});

test("command bar measures overflow and scales PASSIVA ATIVA copy to fit", () => {
  const runtime = read("app/match-ui-runtime.tsx");
  const css = read("app/command-bar-fixes.css");
  assert.match(runtime, /commandChipFits/);
  assert.match(runtime, /for \(let index = 0; index < 8; index \+= 1\)/);
  assert.match(runtime, /COMMAND_MIN_TITLE_PX = 7/);
  assert.match(runtime, /COMMAND_MIN_COPY_PX = 7\.5/);
  assert.match(runtime, /mutationTouchesCommandBar/);
  assert.match(runtime, /resizeObserver\.unobserve\(chip\)/);
  assert.match(css, /white-space:nowrap!important/);
  assert.match(css, /data-command-text-fit="minimum"/);
});

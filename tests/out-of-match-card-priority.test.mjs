import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../app/presentation/cards/card-art-warmup-runtime.tsx", import.meta.url), "utf8");

test("outside-match heroes reuse the clean local portrait assets from the match HUD", () => {
  for (const hero of ["gimble","goblin","uruk","tifon","saymon","tessalia","quarion","rasmus","ngoro","zayan","natureza"]) {
    assert.match(runtime, new RegExp(`/heroes/${hero}\\.webp`));
  }
  assert.match(runtime, /canvas\.style\.backgroundImage = `url\("\$\{hero\.src\}"\)`/);
  assert.match(runtime, /canvas\.style\.backgroundSize = "cover"/);
  assert.match(runtime, /canvas\.style\.backgroundPosition = hero\.position/);
  assert.match(runtime, /canvas\.getContext\("2d"\)\?\.clearRect/);
  assert.match(runtime, /canvas\.dataset\.artQuality = "clean-hero"/);
  assert.match(runtime, /canvas\.closest\("\.screen-game \.game-stage"\)/);
});

test("selected heroes are promoted before generic PDF catalogue warming", () => {
  assert.match(runtime, /setAttribute\("fetchpriority", highPriority \? "high" : "auto"\)/);
  assert.match(runtime, /\.deck-picker select/);
  assert.match(runtime, /\.deck-rail button\.active/);
  assert.match(runtime, /\.collection-hero-inspect/);
  assert.match(runtime, /const CATALOGUE_WARMUP_DELAY_MS = 80/);
  const immediateSync = runtime.indexOf("sync();");
  const catalogueWarm = runtime.indexOf("preloadRemoteCardCatalog()", immediateSync);
  assert.ok(immediateSync >= 0 && catalogueWarm > immediateSync, "critical sync must happen before generic catalogue warmup");
});

test("selected deck cards get a front-of-deck tier before abortable background warming", () => {
  assert.match(runtime, /const FRONT_DECK_PREWARM_COUNT = 5/);
  assert.match(runtime, /const front = pages\.slice\(0, FRONT_DECK_PREWARM_COUNT\)/);
  assert.match(runtime, /const background = pages\.slice\(FRONT_DECK_PREWARM_COUNT\)/);
  assert.match(runtime, /prewarmRemoteCardArtPages\(front,[\s\S]*?priority:\s*1,[\s\S]*?concurrency:\s*1,[\s\S]*?signal:\s*controller\.signal/);
  assert.match(runtime, /prewarmRemoteCardArtPages\(background,[\s\S]*?priority:\s*2,[\s\S]*?concurrency:\s*1,[\s\S]*?signal:\s*controller\.signal/);
  assert.match(runtime, /deckControllers\.get\(id\)\?\.abort\(\)/);
});

test("hover focus and pointer intent promote the exact out-of-match card to critical raster priority", () => {
  assert.match(runtime, /pointerover/);
  assert.match(runtime, /focusin/);
  assert.match(runtime, /pointerdown/);
  assert.match(runtime, /prewarmRemoteCardArtPages\(\[page\], PROMOTED_CARD_WIDTH, \{ priority: 0, concurrency: 1 \}\)/);
  assert.match(runtime, /target\.closest\("\.screen-game \.game-stage"\)/);
  assert.match(runtime, /PROMOTION_THROTTLE_MS = 1800/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../app/presentation/cards/card-art-warmup-runtime.tsx", import.meta.url), "utf8");
const art = readFileSync(new URL("../app/presentation/cards/remote-card-art.tsx", import.meta.url), "utf8");

test("outside-match heroes reuse clean local portrait assets without PDF hero races", () => {
  for (const hero of ["gimble","goblin","uruk","tifon","saymon","tessalia","quarion","rasmus","ngoro","zayan","natureza"]) {
    assert.match(runtime, new RegExp(`/heroes/${hero}\\.webp`));
  }
  assert.match(runtime, /image\.setAttribute\("fetchpriority", priority\)/);
  assert.match(runtime, /canvas\.style\.backgroundImage = `url\("\$\{hero\.src\}"\)`/);
  assert.match(runtime, /canvas\.style\.backgroundPosition = hero\.position/);
  assert.match(runtime, /canvas\.dataset\.artQuality = "clean-hero"/);
  assert.match(art, /CLEAN_HERO_PAGES/);
  assert.match(art, /delegatesToCleanHeroRuntime\(canvas, page\)/);
});

test("selected hero and direct card intent are the highest priority", () => {
  assert.match(runtime, /\.deck-picker select/);
  assert.match(runtime, /\.deck-rail button\.active/);
  assert.match(runtime, /\.collection-hero-inspect/);
  assert.match(runtime, /primeHeroImage\(hero, "high"\)/);
  assert.match(runtime, /pointerover/);
  assert.match(runtime, /focusin/);
  assert.match(runtime, /pointerdown/);
  assert.match(runtime, /promoteRemoteCardArtPage\(page, 0, true\)/);
  assert.match(runtime, /prewarmRemoteCardArtPages\(\[page\], PROMOTED_CARD_WIDTH,[\s\S]*?priority:\s*0/);
});

test("collection follows viewport then scroll-direction neighbours then idle remainder", () => {
  assert.match(runtime, /collectionViewportObserver/);
  assert.match(runtime, /promoteRemoteCardArtPage\(page, 1, false\)/);
  assert.match(runtime, /prewarmRemoteCardArtPages\(\[page\], CARD_PREWARM_WIDTH,[\s\S]*?priority:\s*1/);
  assert.match(runtime, /collectionDirection/);
  assert.match(runtime, /COLLECTION_NEIGHBOR_COUNT_MOBILE = 3/);
  assert.match(runtime, /COLLECTION_NEIGHBOR_COUNT_DESKTOP = 5/);
  assert.match(runtime, /promoteRemoteCardArtPage\(page, 2, false\)/);
  assert.match(runtime, /prewarmRemoteCardArtPages\(pages, CARD_PREWARM_WIDTH,[\s\S]*?priority:\s*2/);
  assert.match(runtime, /requestIdleCallback\(run, \{ timeout: COLLECTION_BACKGROUND_IDLE_TIMEOUT_MS \}\)/);
  assert.match(runtime, /prewarmRemoteCardArtPages\(pagesForHero\(hero\), CARD_PREWARM_WIDTH,[\s\S]*?priority:\s*3/);
  assert.match(runtime, /collectionController\.abort\(\)/);
});

test("menu avoids generic catalogue warming while setup and collection can warm it weakly", () => {
  assert.match(runtime, /CATALOGUE_WARMUP_DELAY_MS = 180/);
  assert.match(runtime, /if \(context !== "setup" && context !== "collection"\) return/);
  assert.match(runtime, /preloadRemoteCardCatalog\(\)/);
  assert.doesNotMatch(runtime, /context === "menu"[\s\S]{0,160}preloadRemoteCardCatalog/);
});

test("screen and selection changes are abortable and reprioritized without layout polling", () => {
  assert.match(runtime, /contextController\.abort\(\)/);
  assert.match(runtime, /cleanupRemoteCardArtMemory\(recentPromotedPages\(\)\)/);
  assert.match(runtime, /setRemoteCardArtContext\(next/);
  assert.match(runtime, /MutationObserver/);
  assert.match(runtime, /document\.addEventListener\("scroll", onScroll, true\)/);
  assert.doesNotMatch(runtime, /getBoundingClientRect|getComputedStyle|DOMMatrixReadOnly/);
});

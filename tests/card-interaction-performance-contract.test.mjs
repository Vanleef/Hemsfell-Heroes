import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/page.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const runtime = fs.readFileSync("app/presentation/runtime/hand-ai-ui-runtime.tsx", "utf8");
const touchRuntime = fs.readFileSync("app/presentation/runtime/mobile-touch-input-runtime.tsx", "utf8");
const art = fs.readFileSync("app/presentation/cards/remote-card-art.tsx", "utf8");
const warmup = fs.readFileSync("app/presentation/cards/card-art-warmup-runtime.tsx", "utf8");
const catalogRoute = fs.readFileSync("app/api/hemsfell-card-catalog.pdf/route.ts", "utf8");
const css = fs.readFileSync("app/presentation/styles/card-interaction-stability-terminal.css", "utf8");
const loadingCss = fs.readFileSync("app/presentation/styles/card-art-loading-terminal.css", "utf8");

test("exhausted target cards stay geometrically stable in field and decision popups", () => {
  assert.match(page, /unit\?\.exhausted\?"is-exhausted"/);
  assert.match(page, /engineTargetDecision/);
  assert.match(css, /original-card\.is-exhausted:is\(\.target-ally,\.target-enemy\)/);
  assert.match(css, /visual-card-choice \.original-card\.is-exhausted/);
  assert.match(css, /transform: none !important/);
  assert.match(css, /translate: none !important/);
  assert.match(css, /rotate: none !important/);
  assert.match(css, /scale: 1 !important/);
});

test("presentation owns a face without card-local icons and restores live icons by CSS state", () => {
  assert.match(css, /card-frame:has\(> \.original-card:is\(\.hh-presentation-hidden,\.is-impacting\)\)/);
  for (const token of ["field-negative-statuses", "field-keywords", "card-frame-marker", "card-frame-activation", "summoning-sickness-badge"]) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /\.hh-flight-face :is\([\s\S]*?revealed-badge[\s\S]*?hh-hand-metric[\s\S]*?display: none !important/);
  assert.doesNotMatch(runtime, /getComputedStyle|DOMMatrixReadOnly|FIELD_FRAME_SELECTOR/);
});

test("revealed public information remains visible on stable hand cards", () => {
  assert.match(page, /!unit&&card\.revealed&&<span className="revealed-badge"/);
  assert.match(page, /card\.revealed\?<OriginalCard/);
  assert.match(css, /:is\(\.player-hand,\.opponent-hand\)[\s\S]*?original-card:not\(\.hh-presentation-hidden\) > \.revealed-badge/);
  assert.match(css, /visibility: visible !important/);
  assert.match(css, /opacity: 1 !important/);
});

test("hand peek marks and moves the actual immediate neighbours with a soft transition", () => {
  assert.match(runtime, /dataset\.hhHandPeek/);
  assert.match(runtime, /previous\.dataset\.hhHandNeighbor = "left"/);
  assert.match(runtime, /next\.dataset\.hhHandNeighbor = "right"/);
  assert.match(runtime, /pointerover/);
  assert.match(runtime, /pointerout/);
  assert.match(runtime, /pointerup/);
  assert.match(runtime, /pointercancel/);
  assert.match(runtime, /dragend/);
  assert.match(css, /--hh-hand-peek-gap/);
  assert.match(css, /data-hh-hand-neighbor="left"[\s\S]*?translate:\s*calc\(-1 \* var\(--hh-hand-peek-gap\)\) 0/);
  assert.match(css, /data-hh-hand-neighbor="right"[\s\S]*?translate:\s*var\(--hh-hand-peek-gap\) 0/);
  assert.match(css, /var\(--hh-hand-overlap, 0cqi\) \+ \.24cqi/);
  assert.match(css, /translate 360ms cubic-bezier\(\.16, 1, \.3, 1\)/);
  assert.match(css, /\[data-hh-hand-neighbor\][\s\S]*?will-change: transform, translate/);
});

test("hand observer ignores board class churn and never reads field layout", () => {
  assert.match(runtime, /observer\.observe\(observerRoot,[\s\S]*?childList: true,[\s\S]*?characterData: true/);
  assert.doesNotMatch(runtime, /attributeFilter|attributes:\s*true/);
  assert.doesNotMatch(runtime, /getBoundingClientRect|getComputedStyle|DOMMatrixReadOnly/);
  assert.match(runtime, /dirtyHands/);
  assert.match(runtime, /observerRoot = document\.querySelector\("\.game-stage"\) \?\? document\.body/);
  assert.match(runtime, /peekNeighbours\.forEach/);
  assert.doesNotMatch(runtime, /querySelectorAll<HTMLElement>\(`\$\{PLAYER_HAND_FRAME_SELECTOR\}\[data-hh-hand-neighbor\]/);
});

test("touch drag hit testing is coalesced to one animation-frame pass", () => {
  assert.match(touchRuntime, /const scheduleDropTargetSync = \(\) => \{[\s\S]*?!session\?\.dragging \|\| session\.syncFrame[\s\S]*?requestAnimationFrame/);
  const pointerMove = touchRuntime.match(/const onPointerMove = \(event: PointerEvent\) => \{([\s\S]*?)\n    \};/)?.[1] || "";
  assert.match(pointerMove, /scheduleDropTargetSync\(\)/);
  assert.doesNotMatch(pointerMove, /updateDropTarget\(point\)/);
});

test("card art uses shared priority observers, stable raster tiers and bounded concurrency", () => {
  assert.match(art, /MAX_CACHED_RASTER_PROMISES = 48/);
  assert.match(art, /MIN_COMPONENT_RASTER_CSS_WIDTH = 64/);
  assert.match(art, /COMPACT_RASTER_CSS_WIDTH = 144/);
  assert.match(art, /STANDARD_RASTER_CSS_WIDTH = 240/);
  assert.match(art, /DETAIL_RASTER_CSS_WIDTH = 360/);
  assert.match(art, /RANGE_CHUNK_SIZE = 512 \* 1024/);
  assert.match(art, /const rasterQueue: RasterJob\[\]/);
  assert.match(art, /maxConcurrentRasterJobs/);
  assert.match(art, /priority < rasterQueue\[bestIndex\]\.priority/);
  assert.match(art, /let nearObserver: IntersectionObserver \| null = null/);
  assert.match(art, /let visibleObserver: IntersectionObserver \| null = null/);
  assert.match(art, /rootMargin: coarse \? "96px 0px" : "180px 0px"/);
  assert.match(art, /rasterCacheLimit\(\)/);
  assert.match(art, /isMemoryConstrainedDevice\(\) \? 1\.25 : 1\.5/);
  assert.doesNotMatch(art, /"260px"|"440px"/);
});

test("compact card rasters persist between screens while detail upgrades stay progressive", () => {
  assert.match(art, /PERSISTENT_RASTER_CACHE = "hemsfell-card-raster-v4"/);
  assert.match(art, /caches\.open\(PERSISTENT_RASTER_CACHE\)/);
  assert.match(art, /persistentCachePromise \?\?=/);
  assert.match(art, /createImageBitmap\(blob\)/);
  assert.match(art, /toBlob\(resolve, "image\/webp", 0\.84\)/);
  assert.match(art, /targetBucket === COMPACT_RASTER_CSS_WIDTH \? "final" : "preview"/);
  assert.match(art, /upgradePriority = Math\.min\(3, priority \+ 1\) as RasterPriority/);
  assert.match(art, /context\.drawImage\(raster, 0, 0\)/);
  assert.match(art, /renderGeneration/);
  assert.doesNotMatch(art, /setRenderRequest/);
});

test("PDF catalogue warmup is contextual and match-specific prewarm remains available", () => {
  assert.match(art, /export async function preloadRemoteCardCatalog/);
  assert.match(art, /export async function prewarmRemoteCardArtPages/);
  assert.match(warmup, /preloadRemoteCardCatalog/);
  assert.match(warmup, /context !== "setup" && context !== "collection"/);
  assert.match(layout, /<CardArtWarmupRuntime \/>/);
  assert.match(runtime, /preloadRemoteCardCatalog/);
  assert.match(runtime, /prewarmRemoteCardArtPages\(pages, 64\)/);
  assert.match(runtime, /data-page/);
});

test("match start releases after opening cards while retaining both decks for background warmup", () => {
  assert.match(page, /preloadMatchCardArt/);
  assert.match(page, /matchArtPreloadPlan=\(state:Game\)/);
  assert.match(page, /\.\.\.player\.hand,[\s\S]*?\.\.\.player\.deck,[\s\S]*?\.\.\.player\.extraDeck/);
  assert.match(page, /criticalPages:\[\.\.\.heroPages,\.\.\.visibleCards\.map/);
  assert.match(page, /backgroundPages:allMatchCards\.map/);
  assert.doesNotMatch(page, /criticalPages:[^\n]*player\.extraDeck/);
  assert.match(page, /heroAssetUrls=game\.players\.map/);
  assert.match(page, /assetUrls:\[MATCH_CARD_BACK_URL,\.\.\.heroAssetUrls\]/);
  assert.doesNotMatch(page, /preloadMatchCardArt\([\s\S]{0,200}cards\.map/);
});

test("hero images and the CSS card back receive immediate browser preload hints", () => {
  assert.match(page, /MATCH_CARD_BACK_URL="\/cards\/card-back-hemsfell\.webp"/);
  assert.match(page, /heroPortraitSources\[player\.heroId as DeckId\]\.src/);
  assert.match(page, /<Image src=\{source\.src\}[\s\S]{0,180}preload fetchPriority="high"/);
});

test("loading placeholder is static and disappears as soon as usable pixels exist", () => {
  assert.match(loadingCss, /\.remote-card-art:not\(\[data-loaded="true"\]\)/);
  assert.match(loadingCss, /linear-gradient/);
  assert.match(loadingCss, /data-art-quality="preview"/);
  assert.doesNotMatch(loadingCss, /@keyframes|animation:/);
});

test("catalogue proxy caches range chunks at browser and CDN layers", () => {
  assert.match(catalogRoute, /cache:\s*"force-cache"/);
  assert.match(catalogRoute, /revalidate:\s*86400/);
  assert.match(catalogRoute, /vary:\s*"Range"/);
  assert.match(catalogRoute, /"cdn-cache-control"/);
  assert.match(catalogRoute, /"vercel-cdn-cache-control"/);
  assert.doesNotMatch(catalogRoute, /cache:\s*"no-store"/);
});

test("interaction and loading authorities remain before the final tutorial authority", () => {
  const imports = [...layout.matchAll(/import\s+"([^"]+\.css)";/g)].map((match) => match[1]);
  const hand = imports.indexOf("./presentation/styles/hand-ai-ui-terminal.css");
  const stability = imports.indexOf("./presentation/styles/card-interaction-stability-terminal.css");
  const loading = imports.indexOf("./presentation/styles/card-art-loading-terminal.css");
  const tutorial = imports.indexOf("./presentation/styles/tutorial-current-ui-terminal.css");
  assert.ok(stability > hand);
  assert.ok(loading > stability);
  assert.ok(tutorial > loading);
  assert.equal(imports.at(-1), "./presentation/styles/tutorial-current-ui-terminal.css");
});

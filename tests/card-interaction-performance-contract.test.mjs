import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/page.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const screenGate = fs.readFileSync("app/presentation/runtime/screen-runtime-gate.tsx", "utf8");
const matchGate = fs.readFileSync("app/presentation/runtime/match-runtime-gate.tsx", "utf8");
const runtime = fs.readFileSync("app/presentation/runtime/hand-ai-ui-runtime.tsx", "utf8");
const touchRuntime = fs.readFileSync("app/presentation/runtime/mobile-touch-input-runtime.tsx", "utf8");
const art = fs.readFileSync("app/presentation/cards/remote-card-art.tsx", "utf8");
const warmup = fs.readFileSync("app/presentation/cards/card-art-warmup-runtime.tsx", "utf8");
const generator = fs.readFileSync("scripts/generate-card-art.mjs", "utf8");
const manifest = JSON.parse(fs.readFileSync("app/data/catalog/card-art.generated.json", "utf8"));
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
  for (const token of ["field-negative-statuses", "field-keywords", "card-frame-marker", "card-frame-activation", "summoning-sickness-badge"]) assert.match(css, new RegExp(token));
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
});

test("touch drag measures legal zones once then hit-tests cached geometry per frame", () => {
  assert.match(touchRuntime, /type DropCandidate = \{ zone: HTMLElement; rect: DOMRectReadOnly \}/);
  assert.match(touchRuntime, /collectDropCandidates\(current\.dataTransfer\)/);
  assert.match(touchRuntime, /pointInside\(candidate\.rect, point\)/);
  assert.match(touchRuntime, /const scheduleDropTargetSync = \(\) => \{[\s\S]*?requestAnimationFrame/);
  assert.doesNotMatch(touchRuntime, /elementsFromPoint/);
  const pointerMove = touchRuntime.match(/const onPointerMove = \(event: PointerEvent\) => \{([\s\S]*?)\n    \};/)?.[1] || "";
  assert.match(pointerMove, /scheduleDropTargetSync\(\)/);
  assert.doesNotMatch(pointerMove, /querySelectorAll|getBoundingClientRect|dispatchDrag\([^,]+, "dragover"/);
});

test("coarse-pointer tap and long-press share one gesture controller with no artificial tap delay", () => {
  assert.match(touchRuntime, /INSPECTION_HOLD_MS = 1_000/);
  assert.match(touchRuntime, /beginInspectionHold\(session\)/);
  assert.match(touchRuntime, /window\.addEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(touchRuntime, /control\.click\(\)/);
  assert.doesNotMatch(touchRuntime, /TAP_FALLBACK_DELAY_MS|setTimeout\([^\n]*control\.click|ASCENSION_TEXT_RE/);
  assert.doesNotMatch(touchRuntime, /new MutationObserver/);
});

test("card art uses generated responsive WebP first and keeps bounded PDF fallback", () => {
  assert.match(art, /generatedArtManifest/);
  assert.match(art, /STATIC_ART_WIDTHS/);
  assert.match(art, /staticCardArtSrcSet/);
  assert.match(art, /remote-card-art-static/);
  assert.match(art, /srcSet=\{staticCardArtSrcSet\(page\)\}/);
  assert.match(art, /onError=\{\(\) => setStaticFailed\(true\)\}/);
  assert.match(art, /MAX_CACHED_RASTER_PROMISES = 48/);
  assert.match(art, /COMPACT_RASTER_CSS_WIDTH = 144/);
  assert.match(art, /RANGE_CHUNK_SIZE = 512 \* 1024/);
  assert.match(art, /const rasterQueue: RasterJob\[\]/);
  assert.match(art, /maxConcurrentRasterJobs/);
  assert.match(art, /let nearObserver: IntersectionObserver \| null = null/);
  assert.match(art, /rasterCacheLimit\(\)/);
  assert.match(art, /isMemoryConstrainedDevice\(\) \? 1\.25 : 1\.5/);
});

test("build-time card-art generator creates stable multi-resolution assets without changing the app lockfile", () => {
  assert.deepEqual(manifest.widths, [160, 320, 640]);
  assert.match(generator, /WIDTHS = \[160, 320, 640\]/);
  assert.match(generator, /public\/cards\/generated/);
  assert.match(generator, /canvas\.encode\("webp"/);
  assert.match(generator, /@napi-rs\/canvas@\$\{CANVAS_VERSION\}/);
  assert.match(generator, /--prefix", TOOL_DIR/);
  assert.match(generator, /runtime PDF fallback remains enabled/);
});

test("compact PDF fallback rasters persist while static production art bypasses PDF warmup", () => {
  assert.match(art, /PERSISTENT_RASTER_CACHE = "hemsfell-card-raster-v4"/);
  assert.match(art, /createImageBitmap\(blob\)/);
  assert.match(art, /toBlob\(resolve, "image\/webp", 0\.84\)/);
  assert.match(art, /if \(STATIC_ART_ENABLED\) return/);
  assert.match(art, /if \(hasStaticCardArt\(page\)\) await preloadStaticCardPage/);
  assert.match(art, /renderGeneration/);
});

test("card runtimes and match CSS are gated away from the landing screen", () => {
  assert.match(screenGate, /const CardArtWarmupRuntime = dynamic/);
  assert.match(screenGate, /const GameGlossaryRuntime = dynamic/);
  assert.match(screenGate, /const CardPreviewRuntime = dynamic/);
  assert.match(screenGate, /const carriesCards/);
  assert.match(matchGate, /import "\.\.\/styles\/match-runtime-bundle\.css"/);
  const executableLayout = layout.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(executableLayout, /CardArtWarmupRuntime|GameGlossaryRuntime|CardPreviewRuntime|match-reference\.css/);
  assert.match(executableLayout, /ScreenRuntimeGate/);
});

test("PDF catalogue warmup remains contextual for development fallback", () => {
  assert.match(art, /export async function preloadRemoteCardCatalog/);
  assert.match(art, /export async function prewarmRemoteCardArtPages/);
  assert.match(warmup, /preloadRemoteCardCatalog/);
  assert.match(warmup, /context !== "setup" && context !== "collection"/);
  assert.match(screenGate, /<CardArtWarmupRuntime \/>/);
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
});

test("hero images and the CSS card back receive immediate browser preload hints", () => {
  assert.match(page, /MATCH_CARD_BACK_URL="\/cards\/card-back-hemsfell\.webp"/);
  assert.match(page, /heroPortraitSources\[player\.heroId as DeckId\]\.src/);
  assert.match(page, /<Image src=\{source\.src\}[\s\S]{0,180}preload fetchPriority="high"/);
});

test("loading placeholder is static and supports native image and canvas surfaces", () => {
  assert.match(loadingCss, /\.remote-card-art:not\(\[data-loaded="true"\]\)/);
  assert.match(loadingCss, /img\.remote-card-art-static/);
  assert.match(loadingCss, /object-fit: fill/);
  assert.doesNotMatch(loadingCss, /@keyframes|animation:/);
});

test("catalogue proxy still caches range chunks for fallback rendering", () => {
  assert.match(catalogRoute, /cache:\s*"force-cache"/);
  assert.match(catalogRoute, /revalidate:\s*86400/);
  assert.match(catalogRoute, /vary:\s*"Range"/);
  assert.match(catalogRoute, /"cdn-cache-control"/);
  assert.doesNotMatch(catalogRoute, /cache:\s*"no-store"/);
});

test("lazy match CSS source contract keeps legacy cascade order for regression tests", () => {
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

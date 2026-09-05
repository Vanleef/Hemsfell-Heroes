import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const art = readFileSync(new URL("../app/presentation/cards/remote-card-art.tsx", import.meta.url), "utf8");
const warmup = readFileSync(new URL("../app/presentation/cards/card-art-warmup-runtime.tsx", import.meta.url), "utf8");
const memory = readFileSync(new URL("../app/presentation/runtime/presentation-memory-runtime.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("../app/presentation/cards/card-preview-runtime.tsx", import.meta.url), "utf8");
const uiCleanup = readFileSync(new URL("../app/presentation/cards/asset-context-ui-cleanup-runtime.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("art queue exposes four strict tiers and lower outside-match concurrency", () => {
  assert.match(art, /RemoteCardArtPriority = 0 \| 1 \| 2 \| 3/);
  assert.match(art, /visibilityCallbacks\.get\(entry\.target\)\?\.\(2\)/);
  assert.match(art, /visibilityCallbacks\.get\(entry\.target\)\?\.\(1\)/);
  assert.match(art, /return constrained \? 1 : 2/);
  assert.match(art, /if \(isMatchContext\(\)\) return constrained \? 2 : 3/);
  assert.match(art, /priority < rasterQueue\[bestIndex\]\.priority/);
  assert.match(art, /STATIC_ART_ENABLED/);
});

test("outside-match LRU is explicitly smaller and mobile is more aggressive", () => {
  assert.match(art, /OUT_OF_MATCH_RASTER_LIMIT_MOBILE = 12/);
  assert.match(art, /OUT_OF_MATCH_RASTER_LIMIT_DESKTOP = 24/);
  assert.match(art, /OUT_OF_MATCH_PAGE_LIMIT_MOBILE = 4/);
  assert.match(art, /OUT_OF_MATCH_PAGE_LIMIT_DESKTOP = 6/);
  assert.match(art, /SESSION_RECENT_LIMIT_MOBILE = 6/);
  assert.match(art, /SESSION_RECENT_LIMIT_DESKTOP = 12/);
  assert.match(art, /sessionRecentPages = new Map/);
  assert.match(art, /trimRasterCache\(\)/);
  assert.match(art, /trimPageCache\(\)/);
});

test("match keeps its own universe while actual in-memory pins remain bounded", () => {
  assert.match(art, /MAX_PINNED_MATCH_PAGES_MOBILE = 48/);
  assert.match(art, /MAX_PINNED_MATCH_PAGES_DESKTOP = 64/);
  assert.match(art, /matchPageUniverseRetainers = new Map/);
  assert.match(art, /universe\.forEach\(\(page\) => matchPageUniverseRetainers\.set/);
  assert.match(art, /const retained = universe\.slice\(0, limit\)/);
  assert.match(art, /activeArtContext === "match" && matchPageUniverseRetainers\.has\(job\.page\)/);
  assert.match(art, /prewarmRemoteCardArtPages\(background, COMPACT_RASTER_CSS_WIDTH,[\s\S]*?priority:\s*3/);
});

test("same-screen reprioritization preserves visible work and only drops stale background jobs", () => {
  assert.match(art, /function cancelObsoleteQueuedRasterJobs\(backgroundOnly = false\)/);
  assert.match(art, /if \(backgroundOnly && job\.priority < 3\) continue/);
  assert.match(art, /cancelObsoleteQueuedRasterJobs\(!changed\)/);
  assert.match(art, /promoteRemoteCardArtPage/);
});

test("persistent write references and detached canvases have bounded lifetimes", () => {
  assert.match(art, /PERSISTENT_WRITE_LIMIT_MOBILE = 3/);
  assert.match(art, /PERSISTENT_WRITE_LIMIT_DESKTOP = 6/);
  assert.match(art, /trimPersistentWriteQueue/);
  assert.match(art, /releaseDetachedCanvasSoon/);
  assert.match(art, /canvas\.width = 0/);
  assert.match(art, /canvas\.height = 0/);
  assert.match(art, /bitmap\.close\(\)/);
});

test("context changes clean stale previews and inspectors instead of retaining old card DOM", () => {
  assert.match(art, /hemsfell:asset-context-change/);
  assert.match(preview, /ASSET_CONTEXT_CHANGE_EVENT = "hemsfell:asset-context-change"/);
  assert.match(preview, /window\.addEventListener\(ASSET_CONTEXT_CHANGE_EVENT, onAssetContextChange\)/);
  assert.match(preview, /clearInspectionHold\(\)/);
  assert.match(preview, /closePreview\(\)/);
  assert.match(uiCleanup, /overlay\.inspector\.card-focus-layer/);
  assert.match(uiCleanup, /card-inspection-hold-progress/);
  assert.match(layout, /<AssetContextUiCleanupRuntime \/>/);
});

test("presentation clones are temporary, cleaned at idle, on timeout and on match unmount", () => {
  assert.match(memory, /TEMPORARY_PRESENTATION_SAFETY_MS = 12_000/);
  assert.match(memory, /TEMPORARY_PRESENTATION_SELECTOR/);
  assert.match(memory, /record\.addedNodes\.forEach\(collectAdded\)/);
  assert.match(memory, /record\.removedNodes\.forEach\(collectRemoved\)/);
  assert.match(memory, /sweepTemporary\(true\)/);
  assert.match(memory, /idleWindow\.__hemsfellPresentationBusy/);
  assert.match(memory, /\[\.\.\.temporary\.keys\(\)\]\.forEach\(releaseTemporary\)/);
});

test("warmup context mapping matches the app screen model and cleanup is abortable", () => {
  for (const pair of [
    ["screen-game", "match"],
    ["screen-decks", "collection"],
    ["screen-setup", "setup"],
    ["screen-tutorial", "tutorial"],
    ["screen-menu", "menu"],
  ]) {
    assert.ok(warmup.includes(`app.classList.contains("${pair[0]}")`) && warmup.includes(`return "${pair[1]}"`));
  }
  assert.match(warmup, /contextController\.abort\(\)/);
  assert.match(warmup, /collectionController\.abort\(\)/);
  assert.match(warmup, /cancelIdleCallback/);
  assert.match(warmup, /cancelAnimationFrame/);
  assert.match(warmup, /removeEventListener\("scroll", onScroll, true\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [page, deadlineClock, guard, matchRuntime, terrainRuntime, cardArt, listCss, engine, runtimeGate, aiRuntime, aiWorkerClient, aiAdapter, terminalCss] = await Promise.all([
  read("app/page.tsx"),
  read("app/presentation/runtime/deadline-clock.tsx"),
  read("app/presentation/match/match-ui-guard.tsx"),
  read("app/presentation/match/match-ui-runtime.tsx"),
  read("app/presentation/runtime/terrain-field-anchor-runtime.tsx"),
  read("app/presentation/cards/remote-card-art.tsx"),
  read("app/presentation/styles/card-list-scrollviews.css"),
  read("app/rules-engine/engine-base.mjs"),
  read("app/presentation/runtime/match-runtime-gate.tsx"),
  read("app/rules-engine/ai-system/runtime.ts"),
  read("app/application/ai/browser-ai-worker.ts"),
  read("app/rules-engine/ai-system/controller.ts"),
  read("app/presentation/styles/side-pile-text-shadow-terminal.css"),
]);

test("deadline ticks stay outside the match root and expiry uses one-shot timers", () => {
  assert.doesNotMatch(page, /setClockNow|setInterval\([^\n]*1000/);
  assert.match(page, /setTimeout\(expire,delay\+25\)/);
  assert.match(deadlineClock, /untilNextSecond/);
  assert.match(deadlineClock, /setSeconds\(\(current\) => current === next \? current : next\)/);
});

test("global match guards do not poll the DOM for expired priority", () => {
  assert.doesNotMatch(guard, /setInterval|passExpiredResponseWindow/);
  assert.match(guard, /requestAnimationFrame\(sync\)/);
});

test("heavy presentation runtimes are dynamically loaded only during a match", () => {
  assert.match(runtimeGate, /dynamic\(\(\) => import/);
  assert.match(runtimeGate, /data-match-active/);
  assert.match(runtimeGate, /if \(!active\) return null/);
});

test("geometry observers ignore their own inline style writes", () => {
  assert.doesNotMatch(matchRuntime, /attributeFilter:\s*\["class",\s*"style"\]/);
  assert.match(terrainRuntime, /terrainGeometry/);
  assert.doesNotMatch(terrainRuntime, /characterData:\s*true/);
});

test("PDF cards use bounded range loading and reuse prioritized raster buffers", () => {
  assert.match(cardArt, /disableRange:\s*false/);
  assert.match(cardArt, /disableAutoFetch:\s*true/);
  assert.match(cardArt, /MAX_CACHED_PAGE_PROMISES\s*=\s*48/);
  assert.match(cardArt, /MAX_CACHED_RASTER_PROMISES\s*=\s*48/);
  assert.match(cardArt, /MIN_COMPONENT_RASTER_CSS_WIDTH\s*=\s*64/);
  assert.match(cardArt, /RANGE_CHUNK_SIZE\s*=\s*512 \* 1024/);
  assert.match(cardArt, /prewarmRemoteCardArtPages/);
  assert.match(cardArt, /rasterPromises = new Map/);
  assert.match(cardArt, /let nearObserver: IntersectionObserver \| null = null/);
  assert.match(cardArt, /let visibleObserver: IntersectionObserver \| null = null/);
  assert.match(cardArt, /rasterQueue: RasterJob\[\]/);
  assert.match(cardArt, /PERSISTENT_RASTER_CACHE/);
  assert.doesNotMatch(cardArt, /canvas\.width\s*=\s*1/);
  assert.doesNotMatch(cardArt, /canvas\.height\s*=\s*1/);
  assert.match(listCss, /content-visibility:\s*auto/);
});

test("coarse and slow displays use static match highlights", () => {
  assert.match(terminalCss, /@media \(pointer: coarse\), \(update: slow\)/);
  assert.match(terminalCss, /\.combat-attack-ready/);
  assert.match(terminalCss, /animation: none !important/);
  assert.match(terminalCss, /backdrop-filter: none !important/);
});

test("live match logs are capped before repeated structured clones", () => {
  assert.match(page, /MAX_LIVE_LOG_ENTRIES=200/);
  assert.match(engine, /MAX_LIVE_LOG_ENTRIES = 200/);
});

test("strategic AI search runs in a dedicated worker with a safe fallback", () => {
  assert.match(page, /browser-ai-worker/);
  assert.match(aiWorkerClient, /new Worker\(new URL\("\.\/search\.worker\.ts", import\.meta\.url\)/);
  assert.match(aiRuntime, /const bridge = workerBridge\(\)/);
  assert.match(aiRuntime, /Fall through to the in-thread controller/);
  assert.doesNotMatch(aiAdapter, /executeCommand\(structuredClone\(state\)/);
});

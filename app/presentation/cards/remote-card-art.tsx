"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";

const CATALOG_URL = "/api/hemsfell-card-catalog.pdf";
const MAX_CACHED_PAGE_PROMISES = 12;
const MAX_CACHED_RASTER_PROMISES = 48;
const OUT_OF_MATCH_RASTER_LIMIT_MOBILE = 12;
const OUT_OF_MATCH_RASTER_LIMIT_DESKTOP = 24;
const OUT_OF_MATCH_PAGE_LIMIT_MOBILE = 4;
const OUT_OF_MATCH_PAGE_LIMIT_DESKTOP = 6;
const SESSION_RECENT_LIMIT_MOBILE = 6;
const SESSION_RECENT_LIMIT_DESKTOP = 12;
const PERSISTENT_WRITE_LIMIT_MOBILE = 3;
const PERSISTENT_WRITE_LIMIT_DESKTOP = 6;
const MIN_COMPONENT_RASTER_CSS_WIDTH = 64;
const COMPACT_RASTER_CSS_WIDTH = 144;
const STANDARD_RASTER_CSS_WIDTH = 240;
const DETAIL_RASTER_CSS_WIDTH = 360;
const RANGE_CHUNK_SIZE = 512 * 1024;
const PREWARM_CONCURRENCY = 2;
const PERSISTENT_RASTER_CACHE = "hemsfell-card-raster-v4";
const PERSISTENT_RASTER_PREFIX = "/__hemsfell-card-raster/v4/";
const MAX_PINNED_MATCH_PAGES_MOBILE = 48;
const MAX_PINNED_MATCH_PAGES_DESKTOP = 64;
const MAX_CONTEXT_HOT_PAGES = 6;
const CLEAN_HERO_PAGES = new Set([2, 26, 54, 110, 129, 152, 180, 211, 255, 273, 291]);

export type RemoteCardArtContext = "menu" | "setup" | "collection" | "tutorial" | "match" | "other";
export type RemoteCardArtPriority = 0 | 1 | 2 | 3;
type RasterPriority = RemoteCardArtPriority;
type RasterJob = {
  key: string;
  page: number;
  priority: RasterPriority;
  started: boolean;
  promise: Promise<HTMLCanvasElement>;
  run: () => Promise<HTMLCanvasElement>;
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (error: unknown) => void;
};

type PersistentWrite = { key: string; page: number; canvas: HTMLCanvasElement };

let catalogPromise: Promise<import("pdfjs-dist").PDFDocumentProxy> | null = null;
const pagePromises = new Map<number, Promise<import("pdfjs-dist").PDFPageProxy>>();
const activePageRenders = new Map<number, number>();
const rasterPromises = new Map<string, Promise<HTMLCanvasElement>>();
const rasterPriority = new Map<string, RasterPriority>();
const rasterJobs = new Map<string, RasterJob>();
const rasterQueue: RasterJob[] = [];
let activeRasterJobs = 0;
let activeArtContext: RemoteCardArtContext = "menu";

const visibilityCallbacks = new Map<Element, (priority: RasterPriority) => void>();
let nearObserver: IntersectionObserver | null = null;
let visibleObserver: IntersectionObserver | null = null;

const persistentWriteQueue: PersistentWrite[] = [];
const persistentWriteKeys = new Set<string>();
let persistentWriteScheduled = false;
let persistentCachePromise: Promise<Cache> | null = null;
const matchPageRetainers = new Map<number, number>();
const matchPageUniverseRetainers = new Map<number, number>();
const contextHotPages = new Set<number>();
const sessionRecentPages = new Map<number, number>();
const assetPreloadPromises = new Map<string, Promise<void>>();

function isMemoryConstrainedDevice() {
  if (typeof navigator === "undefined") return false;
  const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0);
  return (memory > 0 && memory <= 4) ||
    (typeof matchMedia === "function" && matchMedia("(pointer: coarse), (max-width: 48rem)").matches);
}

function isMatchContext() {
  return activeArtContext === "match" || matchPageUniverseRetainers.size > 0;
}

function sessionRecentLimit() {
  return isMemoryConstrainedDevice() ? SESSION_RECENT_LIMIT_MOBILE : SESSION_RECENT_LIMIT_DESKTOP;
}

function persistentWriteLimit() {
  return isMemoryConstrainedDevice() ? PERSISTENT_WRITE_LIMIT_MOBILE : PERSISTENT_WRITE_LIMIT_DESKTOP;
}

function touchSessionRecent(page: number) {
  if (!Number.isFinite(page) || page <= 0) return;
  sessionRecentPages.delete(page);
  sessionRecentPages.set(page, Date.now());
  while (sessionRecentPages.size > sessionRecentLimit()) {
    const oldest = sessionRecentPages.keys().next().value as number | undefined;
    if (oldest === undefined) break;
    sessionRecentPages.delete(oldest);
  }
}

function pageFromRasterKey(key: string) {
  const page = Number(key.split(":", 1)[0]);
  return Number.isFinite(page) ? page : 0;
}

function isProtectedPage(page: number) {
  return contextHotPages.has(page) || matchPageRetainers.has(page) || activePageRenders.has(page);
}

function rasterCacheLimit() {
  if (!isMatchContext()) {
    return isMemoryConstrainedDevice() ? OUT_OF_MATCH_RASTER_LIMIT_MOBILE : OUT_OF_MATCH_RASTER_LIMIT_DESKTOP;
  }
  const base = isMemoryConstrainedDevice() ? 24 : MAX_CACHED_RASTER_PROMISES;
  const workingSetHeadroom = isMemoryConstrainedDevice() ? 8 : 12;
  return Math.max(base, matchPageRetainers.size + workingSetHeadroom);
}

function pageCacheLimit() {
  if (!isMatchContext()) {
    return isMemoryConstrainedDevice() ? OUT_OF_MATCH_PAGE_LIMIT_MOBILE : OUT_OF_MATCH_PAGE_LIMIT_DESKTOP;
  }
  return isMemoryConstrainedDevice() ? 8 : MAX_CACHED_PAGE_PROMISES;
}

function abortError(reason = "Obsolete card-art request") {
  if (typeof DOMException !== "undefined") return new DOMException(reason, "AbortError");
  const error = new Error(reason);
  error.name = "AbortError";
  return error;
}

function trimPageCache() {
  const limit = pageCacheLimit();
  while (pagePromises.size > limit) {
    const candidates = [...pagePromises.keys()].filter((page) => !activePageRenders.has(page) && !matchPageRetainers.has(page));
    const oldest = candidates.find((page) => !contextHotPages.has(page) && !sessionRecentPages.has(page))
      ?? candidates.find((page) => !contextHotPages.has(page));
    if (oldest === undefined) break;
    pagePromises.delete(oldest);
  }
}

function trimRasterCache() {
  const limit = rasterCacheLimit();
  while (rasterPromises.size > limit) {
    const candidates = [...rasterPromises.keys()].filter((key) => {
      const page = pageFromRasterKey(key);
      // Retain the match's compact working set, not every detail/preview tier.
      return !contextHotPages.has(page) && !isRetainedCompactRaster(key) && !rasterJobs.has(key);
    });
    const oldest = candidates.find((key) => !sessionRecentPages.has(pageFromRasterKey(key))) ?? candidates[0];
    if (!oldest) break;
    rasterPromises.delete(oldest);
    rasterPriority.delete(oldest);
  }
}

function cancelObsoleteQueuedRasterJobs(backgroundOnly = false) {
  for (let index = rasterQueue.length - 1; index >= 0; index -= 1) {
    const job = rasterQueue[index];
    if (job.started || isProtectedPage(job.page)) continue;
    if (backgroundOnly && job.priority < 3) continue;
    if (activeArtContext === "match" && matchPageUniverseRetainers.has(job.page)) continue;
    rasterQueue.splice(index, 1);
    rasterJobs.delete(job.key);
    rasterPromises.delete(job.key);
    rasterPriority.delete(job.key);
    job.reject(abortError());
  }
}

function trimPersistentWriteQueue(dropObsolete = false) {
  for (let index = persistentWriteQueue.length - 1; index >= 0; index -= 1) {
    const entry = persistentWriteQueue[index];
    const obsolete = dropObsolete
      && !isProtectedPage(entry.page)
      && !(activeArtContext === "match" && matchPageUniverseRetainers.has(entry.page));
    if (!obsolete) continue;
    persistentWriteQueue.splice(index, 1);
    persistentWriteKeys.delete(entry.key);
  }
  while (persistentWriteQueue.length > persistentWriteLimit()) {
    const index = persistentWriteQueue.findIndex((entry) => !isProtectedPage(entry.page));
    const [entry] = persistentWriteQueue.splice(index >= 0 ? index : 0, 1);
    if (entry) persistentWriteKeys.delete(entry.key);
  }
}

function cleanupVisibilityObserversIfIdle() {
  if (visibilityCallbacks.size) return;
  nearObserver?.disconnect();
  visibleObserver?.disconnect();
  nearObserver = null;
  visibleObserver = null;
}

function cleanupPdfDocumentResources() {
  if (!catalogPromise) return;
  void catalogPromise.then((catalog) => catalog.cleanup()).catch(() => undefined);
}

/**
 * Switch the in-memory policy without throwing away the browser/CacheStorage
 * session cache. Selected/focused pages are protected, old queued work is
 * cancelled, and the LRU is immediately trimmed to the new context budget.
 */
export function setRemoteCardArtContext(context: RemoteCardArtContext, hotPages: readonly number[] = []) {
  const previousContext = activeArtContext;
  const changed = previousContext !== context;
  activeArtContext = context;
  contextHotPages.clear();
  for (const page of hotPages) {
    if (!Number.isFinite(page) || page <= 0) continue;
    contextHotPages.add(page);
    touchSessionRecent(page);
    if (contextHotPages.size >= MAX_CONTEXT_HOT_PAGES) break;
  }
  // Same-screen reprioritization must never cancel work that just became visible;
  // only obsolete idle/background requests are disposable without a context swap.
  cancelObsoleteQueuedRasterJobs(!changed);
  trimPersistentWriteQueue(changed);
  trimRasterCache();
  trimPageCache();
  if (changed) {
    cleanupPdfDocumentResources();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hemsfell:asset-context-change", {
        detail: { from: previousContext, to: context },
      }));
    }
  }
}

/** Promote a concrete user request above viewport, near-viewport and idle work. */
export function promoteRemoteCardArtPage(page: number, priority: RasterPriority = 0, remember = priority === 0) {
  if (!Number.isFinite(page) || page <= 0) return;
  touchSessionRecent(page);
  if (remember) {
    contextHotPages.delete(page);
    contextHotPages.add(page);
    while (contextHotPages.size > MAX_CONTEXT_HOT_PAGES) {
      const oldest = contextHotPages.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      contextHotPages.delete(oldest);
    }
  }
  for (const [key, job] of rasterJobs) {
    if (job.page !== page) continue;
    const previous = rasterPriority.get(key);
    if (previous === undefined || priority < previous) rasterPriority.set(key, priority);
    if (!job.started && priority < job.priority) job.priority = priority;
  }
  queueMicrotask(drainRasterQueue);
}

/** Explicit context cleanup used when leaving collection/setup/match. */
export function cleanupRemoteCardArtMemory(keepPages: readonly number[] = []) {
  contextHotPages.clear();
  for (const page of keepPages) {
    if (!Number.isFinite(page) || page <= 0) continue;
    contextHotPages.add(page);
    touchSessionRecent(page);
  }
  cancelObsoleteQueuedRasterJobs();
  trimPersistentWriteQueue(true);
  trimRasterCache();
  trimPageCache();
  cleanupPdfDocumentResources();
  cleanupVisibilityObserversIfIdle();
}

function openPersistentRasterCache() {
  if (typeof caches === "undefined") return null;
  persistentCachePromise ??= caches.open(PERSISTENT_RASTER_CACHE).catch((error) => {
    persistentCachePromise = null;
    throw error;
  });
  return persistentCachePromise;
}

async function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs.getDocument({
        url: CATALOG_URL,
        disableRange: false,
        disableStream: true,
        disableAutoFetch: true,
        rangeChunkSize: RANGE_CHUNK_SIZE,
      }).promise;
    }).catch((error) => {
      catalogPromise = null;
      pagePromises.clear();
      activePageRenders.clear();
      rasterPromises.clear();
      rasterPriority.clear();
      throw error;
    });
  }
  return catalogPromise;
}

/** Start the worker and PDF metadata fetch before a particular card asks for art. */
export async function preloadRemoteCardCatalog() {
  await loadCatalog();
}

/** Reuse a small number of PDF page proxies. The expensive decoded page
 * resources are explicitly cleaned after rasterization, so this Map is only a
 * request/proxy reuse layer rather than a hidden native-memory cache. */
function loadCatalogPage(page: number) {
  let pending = pagePromises.get(page);
  if (pending) {
    pagePromises.delete(page);
    pagePromises.set(page, pending);
  } else {
    pending = loadCatalog().then((catalog) => {
      if (page < 1 || page > catalog.numPages) throw new Error("Card page is outside the catalogue");
      return catalog.getPage(page);
    }).catch((error) => {
      pagePromises.delete(page);
      throw error;
    });
    pagePromises.set(page, pending);
    trimPageCache();
  }
  return pending;
}

function cardPixelRatio() {
  return Math.min(globalThis.devicePixelRatio || 1, isMemoryConstrainedDevice() ? 1.25 : 1.5);
}

/** A card has at most three reusable sizes instead of a new raster for every
 * slightly different width encountered in collection, setup, match and preview. */
function rasterWidthBucket(cssWidth: number) {
  const normalized = Math.max(MIN_COMPONENT_RASTER_CSS_WIDTH, cssWidth);
  if (normalized <= COMPACT_RASTER_CSS_WIDTH) return COMPACT_RASTER_CSS_WIDTH;
  if (normalized <= STANDARD_RASTER_CSS_WIDTH) return STANDARD_RASTER_CSS_WIDTH;
  return DETAIL_RASTER_CSS_WIDTH;
}

function rasterKey(page: number, cssWidth: number, pixelRatio: number) {
  return `${page}:${rasterWidthBucket(cssWidth)}:${pixelRatio.toFixed(2)}`;
}

function isRetainedCompactRaster(key: string) {
  const [page, bucket] = key.split(":").map(Number);
  return bucket === COMPACT_RASTER_CSS_WIDTH && matchPageRetainers.has(page);
}

function retainMatchPages(pages: readonly number[]) {
  const universe = [...new Set(pages.filter((page) => Number.isFinite(page) && page > 0))];
  universe.forEach((page) => matchPageUniverseRetainers.set(page, (matchPageUniverseRetainers.get(page) || 0) + 1));
  const limit = isMemoryConstrainedDevice() ? MAX_PINNED_MATCH_PAGES_MOBILE : MAX_PINNED_MATCH_PAGES_DESKTOP;
  const retained = universe.slice(0, limit);
  retained.forEach((page) => matchPageRetainers.set(page, (matchPageRetainers.get(page) || 0) + 1));
  return () => {
    retained.forEach((page) => {
      const count = matchPageRetainers.get(page) || 0;
      if (count <= 1) matchPageRetainers.delete(page);
      else matchPageRetainers.set(page, count - 1);
    });
    universe.forEach((page) => {
      const count = matchPageUniverseRetainers.get(page) || 0;
      if (count <= 1) matchPageUniverseRetainers.delete(page);
      else matchPageUniverseRetainers.set(page, count - 1);
    });
  };
}

function maxConcurrentRasterJobs() {
  const constrained = isMemoryConstrainedDevice();
  if (isMatchContext()) return constrained ? 2 : 3;
  return constrained ? 1 : 2;
}

function drainRasterQueue() {
  const limit = maxConcurrentRasterJobs();
  while (activeRasterJobs < limit && rasterQueue.length) {
    let bestIndex = 0;
    for (let index = 1; index < rasterQueue.length; index += 1) {
      if (rasterQueue[index].priority < rasterQueue[bestIndex].priority) bestIndex = index;
    }
    const job = rasterQueue.splice(bestIndex, 1)[0];
    job.started = true;
    activeRasterJobs += 1;
    void job.run().then(job.resolve, job.reject).finally(() => {
      activeRasterJobs -= 1;
      rasterJobs.delete(job.key);
      // Pending jobs are protected during insertion; enforce the budget again
      // after they settle, including a burst with no subsequent card requests.
      trimRasterCache();
      queueMicrotask(drainRasterQueue);
    });
  }
}

function scheduleRasterRender(
  key: string,
  page: number,
  priority: RasterPriority,
  run: () => Promise<HTMLCanvasElement>,
) {
  const existing = rasterJobs.get(key);
  if (existing) {
    if (!existing.started && priority < existing.priority) existing.priority = priority;
    queueMicrotask(drainRasterQueue);
    return existing.promise;
  }

  let resolve!: (canvas: HTMLCanvasElement) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<HTMLCanvasElement>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  const job: RasterJob = { key, page, priority, started: false, promise, run, resolve, reject };
  rasterJobs.set(key, job);
  rasterQueue.push(job);
  queueMicrotask(drainRasterQueue);
  return promise;
}

function promoteRasterJob(key: string, priority: RasterPriority) {
  const previous = rasterPriority.get(key);
  if (previous === undefined || priority < previous) rasterPriority.set(key, priority);
  const job = rasterJobs.get(key);
  if (job && !job.started && priority < job.priority) job.priority = priority;
  if (job) queueMicrotask(drainRasterQueue);
}

async function renderPdfPageToCanvas(canvas: HTMLCanvasElement, page: number, cssWidth: number, pixelRatio: number) {
  const pdfPage = await loadCatalogPage(page);
  activePageRenders.set(page, (activePageRenders.get(page) || 0) + 1);
  try {
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: (cssWidth / baseViewport.width) * pixelRatio });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas indisponível");
    const renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
    await renderTask.promise;
    return canvas;
  } finally {
    const remaining = Math.max(0, (activePageRenders.get(page) || 1) - 1);
    if (remaining) activePageRenders.set(page, remaining);
    else {
      activePageRenders.delete(page);
      try { pdfPage.cleanup(); } catch { /* A later render can rebuild the page resources. */ }
    }
    trimPageCache();
  }
}

function persistentRasterUrl(page: number, pixelRatio: number) {
  const ratio = Math.round(pixelRatio * 100);
  const origin = typeof location === "undefined" ? "https://hemsfell.invalid" : location.origin;
  return `${origin}${PERSISTENT_RASTER_PREFIX}${page}-${ratio}.webp`;
}

async function restorePersistentCompactRaster(page: number, pixelRatio: number) {
  if (typeof caches === "undefined" || typeof createImageBitmap !== "function") return null;
  try {
    const cache = await openPersistentRasterCache();
    if (!cache) return null;
    const response = await cache.match(persistentRasterUrl(page, pixelRatio));
    if (!response) return null;
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.style.aspectRatio = response.headers.get("x-hemsfell-aspect") || "5 / 7";
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        return null;
      }
      context.drawImage(bitmap, 0, 0);
      return canvas;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

function requestPersistentWriteDrain() {
  if (persistentWriteScheduled || !persistentWriteQueue.length || typeof window === "undefined") return;
  persistentWriteScheduled = true;

  const run = () => {
    const entry = persistentWriteQueue.shift();
    if (!entry) {
      persistentWriteScheduled = false;
      return;
    }
    void (async () => {
      try {
        const blob = await new Promise<Blob | null>((resolve) => entry.canvas.toBlob(resolve, "image/webp", 0.84));
        if (!blob) return;
        const cache = await openPersistentRasterCache();
        if (!cache) return;
        await cache.put(entry.key, new Response(blob, {
          headers: {
            "content-type": "image/webp",
            "cache-control": "public, max-age=31536000, immutable",
            "x-hemsfell-aspect": entry.canvas.style.aspectRatio || "5 / 7",
          },
        }));
      } catch {
        // Cache Storage is opportunistic; PDF.js remains the canonical fallback.
      } finally {
        persistentWriteKeys.delete(entry.key);
        persistentWriteScheduled = false;
        requestPersistentWriteDrain();
      }
    })();
  };

  const idleWindow = window as unknown as {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(run, { timeout: 2500 });
  else window.setTimeout(run, 700);
}

function schedulePersistentWrite(key: string, page: number, canvas: HTMLCanvasElement) {
  if (typeof caches === "undefined" || persistentWriteKeys.has(key)) return;
  persistentWriteKeys.add(key);
  persistentWriteQueue.push({ key, page, canvas });
  trimPersistentWriteQueue(false);
  requestPersistentWriteDrain();
}

async function createRaster(page: number, bucket: number, pixelRatio: number, key: string, priority: RasterPriority) {
  const desiredPriority = rasterPriority.get(key) ?? priority;
  return scheduleRasterRender(
    key,
    page,
    desiredPriority,
    async () => {
      // Cache reads and bitmap decoding consume memory too. Keep the entire
      // pipeline behind the same mobile/desktop priority and concurrency gate.
      if (bucket === COMPACT_RASTER_CSS_WIDTH) {
        const persisted = await restorePersistentCompactRaster(page, pixelRatio);
        if (persisted) return persisted;
      }
      const raster = await renderPdfPageToCanvas(document.createElement("canvas"), page, bucket, pixelRatio);
      if (bucket === COMPACT_RASTER_CSS_WIDTH) {
        schedulePersistentWrite(persistentRasterUrl(page, pixelRatio), page, raster);
      }
      return raster;
    },
  );
}

/** Cache the expensive PDF raster. Repeated copies and repeated screens share
 * one of three stable tiers, and compact thumbnails survive page reloads. */
function loadCardRaster(page: number, cssWidth: number, priority: RasterPriority = 1) {
  touchSessionRecent(page);
  const pixelRatio = cardPixelRatio();
  const bucket = rasterWidthBucket(cssWidth);
  const key = rasterKey(page, bucket, pixelRatio);
  promoteRasterJob(key, priority);

  let pending = rasterPromises.get(key);
  if (pending) {
    rasterPromises.delete(key);
    rasterPromises.set(key, pending);
    return pending;
  }

  pending = createRaster(page, bucket, pixelRatio, key, priority).catch((error) => {
    // A cancelled request can settle after the next screen requests this key.
    if (rasterPromises.get(key) === pending) {
      rasterPromises.delete(key);
      rasterPriority.delete(key);
    }
    throw error;
  });
  rasterPromises.set(key, pending);
  trimRasterCache();
  return pending;
}

/** Four tiers: selected/focus 0, visible 1, nearby 2, idle/background 3. */
export async function prewarmRemoteCardArtPages(
  pages: readonly number[],
  cssWidth = MIN_COMPONENT_RASTER_CSS_WIDTH,
  options: { priority?: RasterPriority; concurrency?: number; signal?: AbortSignal } = {},
) {
  const queue = [...new Set(pages.filter((page) => Number.isFinite(page) && page > 0))];
  if (!queue.length) return;
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      if (options.signal?.aborted) return;
      const page = queue[cursor++];
      try {
        await loadCardRaster(page, cssWidth, options.priority ?? 3);
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          // Mounted RemoteCardArt instances retain their own error/fallback path.
        }
      }
    }
  };
  const concurrency = Math.max(1, Math.min(options.concurrency ?? PREWARM_CONCURRENCY, queue.length));
  await Promise.all(Array.from({ length: concurrency }, worker));
}

function preloadStaticImageAsset(url: string) {
  if (typeof window === "undefined") return Promise.resolve();
  let pending = assetPreloadPromises.get(url);
  if (pending) return pending;
  pending = new Promise<void>((resolve) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => { assetPreloadPromises.delete(url); resolve(); };
    image.src = url;
    if (image.complete) resolve();
  });
  assetPreloadPromises.set(url, pending);
  return pending;
}

let matchArtPreloadGeneration = 0;

export function preloadMatchCardArt({
  criticalPages,
  backgroundPages,
  assetUrls = [],
}: {
  criticalPages: readonly number[];
  backgroundPages: readonly number[];
  assetUrls?: readonly string[];
}) {
  const critical = [...new Set(criticalPages.filter((page) => Number.isFinite(page) && page > 0))];
  const criticalSet = new Set(critical);
  const background = [...new Set(backgroundPages.filter((page) => Number.isFinite(page) && page > 0 && !criticalSet.has(page)))];
  const releasePages = retainMatchPages([...critical, ...background]);
  const controller = new AbortController();

  const generation = ++matchArtPreloadGeneration;
  document.documentElement.dataset.matchArtWarming = "true";
  const essential = Promise.all([
    ...assetUrls.map(preloadStaticImageAsset),
    prewarmRemoteCardArtPages(critical, COMPACT_RASTER_CSS_WIDTH, {
    priority: 0,
    concurrency: isMemoryConstrainedDevice() ? 1 : 2,
    signal: controller.signal,
  }),
  ]).then(() => {
    if (!controller.signal.aborted && generation === matchArtPreloadGeneration) delete document.documentElement.dataset.matchArtWarming;
  });

  const runBackground = () => {
    if (controller.signal.aborted) return;
    void essential.then(() => controller.signal.aborted ? undefined : prewarmRemoteCardArtPages(background, COMPACT_RASTER_CSS_WIDTH, {
      priority: 3,
      concurrency: isMemoryConstrainedDevice() ? 1 : 2,
      signal: controller.signal,
    }));
  };
  const idleWindow = window as unknown as {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const idleHandle = idleWindow.requestIdleCallback
    ? idleWindow.requestIdleCallback(runBackground, { timeout: 500 })
    : window.setTimeout(runBackground, 0);

  return () => {
    controller.abort();
    if (generation === matchArtPreloadGeneration) delete document.documentElement.dataset.matchArtWarming;
    if (idleWindow.requestIdleCallback) idleWindow.cancelIdleCallback?.(idleHandle);
    else window.clearTimeout(idleHandle);
    releasePages();
    cancelObsoleteQueuedRasterJobs();
    trimPersistentWriteQueue(true);
    trimRasterCache();
    trimPageCache();
    cleanupPdfDocumentResources();
  };
}

function copyRaster(canvas: HTMLCanvasElement, raster: HTMLCanvasElement, page: number, quality: "preview" | "final") {
  canvas.width = raster.width;
  canvas.height = raster.height;
  canvas.style.aspectRatio = raster.style.aspectRatio;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas indisponível");
  context.drawImage(raster, 0, 0);
  canvas.dataset.loaded = "true";
  canvas.dataset.artQuality = quality;
  canvas.dataset.renderedPage = String(page);
  delete canvas.dataset.loading;
}

async function paintCardArt(
  canvas: HTMLCanvasElement,
  page: number,
  cssWidth: number,
  priority: RasterPriority = 0,
  shouldCommit: () => boolean = () => true,
) {
  const width = Math.max(cssWidth, canvas.clientWidth, MIN_COMPONENT_RASTER_CSS_WIDTH);
  const targetBucket = rasterWidthBucket(width);

  if (canvas.dataset.renderedPage === String(page) && canvas.dataset.artQuality === "final") return;

  const compact = await loadCardRaster(page, COMPACT_RASTER_CSS_WIDTH, priority);
  if (!shouldCommit()) return;
  copyRaster(canvas, compact, page, targetBucket === COMPACT_RASTER_CSS_WIDTH ? "final" : "preview");

  if (targetBucket !== COMPACT_RASTER_CSS_WIDTH) {
    const upgradePriority = Math.min(3, priority + 1) as RasterPriority;
    const finalRaster = await loadCardRaster(page, targetBucket, upgradePriority);
    if (!shouldCommit()) return;
    copyRaster(canvas, finalRaster, page, "final");
  }
}

export async function renderRemoteCardArtToCanvas(canvas: HTMLCanvasElement, page: number, cssWidth = 120) {
  promoteRemoteCardArtPage(page, 0, false);
  await paintCardArt(canvas, page, cssWidth, 0);
}

function ensureVisibilityObservers() {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!nearObserver) {
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse), (max-width: 48rem)").matches;
    nearObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        visibilityCallbacks.get(entry.target)?.(2);
        nearObserver?.unobserve(entry.target);
      }
    }, { rootMargin: coarse ? "96px 0px" : "180px 0px" });
  }
  if (!visibleObserver) {
    visibleObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        visibilityCallbacks.get(entry.target)?.(1);
        visibleObserver?.unobserve(entry.target);
        nearObserver?.unobserve(entry.target);
      }
    }, { rootMargin: "0px" });
  }
  return { nearObserver, visibleObserver };
}

function observeCardVisibility(canvas: HTMLCanvasElement, callback: (priority: RasterPriority) => void) {
  const observers = ensureVisibilityObservers();
  if (!observers) {
    const frame = requestAnimationFrame(() => callback(1));
    return () => cancelAnimationFrame(frame);
  }
  visibilityCallbacks.set(canvas, callback);
  observers.nearObserver.observe(canvas);
  observers.visibleObserver.observe(canvas);
  return () => {
    visibilityCallbacks.delete(canvas);
    observers.nearObserver.unobserve(canvas);
    observers.visibleObserver.unobserve(canvas);
    cleanupVisibilityObserversIfIdle();
  };
}

function releaseDetachedCanvasSoon(canvas: HTMLCanvasElement) {
  queueMicrotask(() => {
    if (canvas.isConnected) return;
    try { canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); } catch { /* detached */ }
    canvas.width = 0;
    canvas.height = 0;
  });
}

function delegatesToCleanHeroRuntime(canvas: HTMLCanvasElement, page: number) {
  return CLEAN_HERO_PAGES.has(page) && (!canvas.closest(".screen-game .game-stage") || canvas.dataset.preferCleanHeroArt === "true");
}

type RemoteCardArtProps = {
  page: number;
  name: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
  /** Hero inspectors use the curated portrait asset even while the match is mounted. */
  preferCleanHeroArt?: boolean;
};

function RemoteCardArtComponent({ page, name, className = "", style, priority = false, preferCleanHeroArt = false }: RemoteCardArtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const renderGeneration = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let requestedPriority: RasterPriority | null = null;
    setFailed(false);
    delete canvas.dataset.loaded;
    delete canvas.dataset.artQuality;

    if (delegatesToCleanHeroRuntime(canvas, page)) {
      delete canvas.dataset.loading;
      return () => {
        disposed = true;
        renderGeneration.current += 1;
        releaseDetachedCanvasSoon(canvas);
      };
    }

    canvas.dataset.loading = "true";
    if (canvas.dataset.renderedPage && canvas.dataset.renderedPage !== String(page)) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }

    const requestPaint = (nextPriority: RasterPriority) => {
      if (requestedPriority !== null && nextPriority >= requestedPriority) return;
      requestedPriority = nextPriority;
      promoteRemoteCardArtPage(page, nextPriority, priority && nextPriority === 0);
      const generation = ++renderGeneration.current;
      void paintCardArt(
        canvas,
        page,
        Math.max(canvas.clientWidth, MIN_COMPONENT_RASTER_CSS_WIDTH),
        nextPriority,
        () => !disposed && renderGeneration.current === generation && canvasRef.current === canvas,
      ).then(() => {
        if (!disposed && renderGeneration.current === generation) setFailed(false);
      }).catch((error: unknown) => {
        if (!disposed && renderGeneration.current === generation && !["RenderingCancelledException", "AbortError"].includes((error as { name?: string }).name || "")) {
          delete canvas.dataset.loading;
          setFailed(true);
        }
      });
    };

    const stopObserving = priority
      ? (requestPaint(0), () => undefined)
      : observeCardVisibility(canvas, requestPaint);

    return () => {
      disposed = true;
      renderGeneration.current += 1;
      stopObserving();
      releaseDetachedCanvasSoon(canvas);
    };
  }, [page, priority, preferCleanHeroArt]);

  return (
    <canvas
      ref={canvasRef}
      className={`remote-card-art ${failed ? "remote-card-art-failed" : ""} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={name}
      data-page={page}
      data-prefer-clean-hero-art={preferCleanHeroArt ? "true" : undefined}
    />
  );
}

export const RemoteCardArt = memo(RemoteCardArtComponent);
RemoteCardArt.displayName = "RemoteCardArt";

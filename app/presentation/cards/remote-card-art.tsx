"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";

const CATALOG_URL = "/api/hemsfell-card-catalog.pdf";
const MAX_CACHED_PAGE_PROMISES = 48;
const MAX_CACHED_RASTER_PROMISES = 48;
const MIN_COMPONENT_RASTER_CSS_WIDTH = 64;
const COMPACT_RASTER_CSS_WIDTH = 144;
const STANDARD_RASTER_CSS_WIDTH = 240;
const DETAIL_RASTER_CSS_WIDTH = 360;
const RANGE_CHUNK_SIZE = 512 * 1024;
const PREWARM_CONCURRENCY = 2;
const PERSISTENT_RASTER_CACHE = "hemsfell-card-raster-v4";
const PERSISTENT_RASTER_PREFIX = "/__hemsfell-card-raster/v4/";

type RasterPriority = 0 | 1 | 2;
type RasterJob = {
  key: string;
  priority: RasterPriority;
  started: boolean;
  promise: Promise<HTMLCanvasElement>;
  run: () => Promise<HTMLCanvasElement>;
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (error: unknown) => void;
};

let catalogPromise: Promise<import("pdfjs-dist").PDFDocumentProxy> | null = null;
const pagePromises = new Map<number, Promise<import("pdfjs-dist").PDFPageProxy>>();
const rasterPromises = new Map<string, Promise<HTMLCanvasElement>>();
const rasterPriority = new Map<string, RasterPriority>();
const rasterJobs = new Map<string, RasterJob>();
const rasterQueue: RasterJob[] = [];
let activeRasterJobs = 0;

const visibilityCallbacks = new Map<Element, (priority: RasterPriority) => void>();
let nearObserver: IntersectionObserver | null = null;
let visibleObserver: IntersectionObserver | null = null;

const persistentWriteQueue: Array<{ key: string; canvas: HTMLCanvasElement }> = [];
const persistentWriteKeys = new Set<string>();
let persistentWriteScheduled = false;
let persistentCachePromise: Promise<Cache> | null = null;

function isMemoryConstrainedDevice() {
  if (typeof navigator === "undefined") return false;
  const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0);
  return (memory > 0 && memory <= 4) ||
    (typeof matchMedia === "function" && matchMedia("(pointer: coarse), (max-width: 48rem)").matches);
}

function rasterCacheLimit() {
  return isMemoryConstrainedDevice() ? 24 : MAX_CACHED_RASTER_PROMISES;
}

function pageCacheLimit() {
  return isMemoryConstrainedDevice() ? 24 : MAX_CACHED_PAGE_PROMISES;
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

/** Reuse PDF page proxies across menu, collection, setup, match and inspector. */
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
    while (pagePromises.size > pageCacheLimit()) {
      const oldest = pagePromises.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      pagePromises.delete(oldest);
    }
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

function maxConcurrentRasterJobs() {
  if (typeof matchMedia !== "function") return 2;
  return matchMedia("(pointer: coarse), (max-width: 48rem)").matches ? 2 : 3;
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
      queueMicrotask(drainRasterQueue);
    });
  }
}

function scheduleRasterRender(key: string, priority: RasterPriority, run: () => Promise<HTMLCanvasElement>) {
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
  const job: RasterJob = { key, priority, started: false, promise, run, resolve, reject };
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
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.style.aspectRatio = response.headers.get("x-hemsfell-aspect") || "5 / 7";
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  } catch {
    return null;
  }
}

function requestPersistentWriteDrain() {
  if (persistentWriteScheduled || !persistentWriteQueue.length || typeof window === "undefined") return;
  persistentWriteScheduled = true;

  const run = () => {
    persistentWriteScheduled = false;
    const entry = persistentWriteQueue.shift();
    if (!entry) return;
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
        requestPersistentWriteDrain();
      }
    })();
  };

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(run, { timeout: 2500 });
  else window.setTimeout(run, 700);
}

function schedulePersistentWrite(key: string, canvas: HTMLCanvasElement) {
  if (typeof caches === "undefined" || persistentWriteKeys.has(key)) return;
  persistentWriteKeys.add(key);
  persistentWriteQueue.push({ key, canvas });
  requestPersistentWriteDrain();
}

async function createRaster(page: number, bucket: number, pixelRatio: number, key: string, priority: RasterPriority) {
  if (bucket === COMPACT_RASTER_CSS_WIDTH) {
    const persisted = await restorePersistentCompactRaster(page, pixelRatio);
    if (persisted) return persisted;
  }

  // Start the shared page/range promise immediately, while the bounded raster
  // scheduler decides when this canvas render may use CPU.
  void loadCatalogPage(page);
  const desiredPriority = rasterPriority.get(key) ?? priority;
  const raster = await scheduleRasterRender(
    key,
    desiredPriority,
    () => renderPdfPageToCanvas(document.createElement("canvas"), page, bucket, pixelRatio),
  );
  if (bucket === COMPACT_RASTER_CSS_WIDTH) {
    schedulePersistentWrite(persistentRasterUrl(page, pixelRatio), raster);
  }
  return raster;
}

/** Cache the expensive PDF raster. Repeated copies and repeated screens share
 * one of three stable tiers, and compact thumbnails survive page reloads. */
function loadCardRaster(page: number, cssWidth: number, priority: RasterPriority = 1) {
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
    rasterPromises.delete(key);
    rasterPriority.delete(key);
    throw error;
  });
  rasterPromises.set(key, pending);
  while (rasterPromises.size > rasterCacheLimit()) {
    const oldest = rasterPromises.keys().next().value as string | undefined;
    if (oldest === undefined || oldest === key) break;
    rasterPromises.delete(oldest);
    rasterPriority.delete(oldest);
  }
  return pending;
}

/** Background warming is always lower priority than cards actually on screen. */
export async function prewarmRemoteCardArtPages(pages: readonly number[], cssWidth = MIN_COMPONENT_RASTER_CSS_WIDTH) {
  const queue = [...new Set(pages.filter((page) => Number.isFinite(page) && page > 0))];
  if (!queue.length) return;
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const page = queue[cursor++];
      try {
        await loadCardRaster(page, cssWidth, 2);
      } catch {
        // Mounted RemoteCardArt instances retain their own error/fallback path.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREWARM_CONCURRENCY, queue.length) }, worker));
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

  // Paint a small reusable thumbnail first. On later visits it normally comes
  // from Cache Storage before PDF.js has to parse/render anything.
  const compact = await loadCardRaster(page, COMPACT_RASTER_CSS_WIDTH, priority);
  if (!shouldCommit()) return;
  copyRaster(canvas, compact, page, targetBucket === COMPACT_RASTER_CSS_WIDTH ? "final" : "preview");

  if (targetBucket !== COMPACT_RASTER_CSS_WIDTH) {
    // Quality upgrades yield to other visible compact thumbnails so the whole
    // screen fills in before one large card consumes the render queue.
    const upgradePriority: RasterPriority = priority === 0 ? 1 : priority;
    const finalRaster = await loadCardRaster(page, targetBucket, upgradePriority);
    if (!shouldCommit()) return;
    copyRaster(canvas, finalRaster, page, "final");
  }
}

export async function renderRemoteCardArtToCanvas(canvas: HTMLCanvasElement, page: number, cssWidth = 120) {
  await paintCardArt(canvas, page, cssWidth, 0);
}

function ensureVisibilityObservers() {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!nearObserver) {
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse), (max-width: 48rem)").matches;
    nearObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        visibilityCallbacks.get(entry.target)?.(1);
        nearObserver?.unobserve(entry.target);
      }
    }, { rootMargin: coarse ? "96px 0px" : "180px 0px" });
  }
  if (!visibleObserver) {
    visibleObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        visibilityCallbacks.get(entry.target)?.(0);
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
    const frame = requestAnimationFrame(() => callback(0));
    return () => cancelAnimationFrame(frame);
  }
  visibilityCallbacks.set(canvas, callback);
  observers.nearObserver.observe(canvas);
  observers.visibleObserver.observe(canvas);
  return () => {
    visibilityCallbacks.delete(canvas);
    observers.nearObserver.unobserve(canvas);
    observers.visibleObserver.unobserve(canvas);
  };
}

type RemoteCardArtProps = {
  page: number;
  name: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
};

function RemoteCardArtComponent({ page, name, className = "", style, priority = false }: RemoteCardArtProps) {
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
    canvas.dataset.loading = "true";
    if (canvas.dataset.renderedPage && canvas.dataset.renderedPage !== String(page)) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }

    const requestPaint = (nextPriority: RasterPriority) => {
      if (requestedPriority !== null && nextPriority >= requestedPriority) return;
      requestedPriority = nextPriority;
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
        if (!disposed && renderGeneration.current === generation && (error as { name?: string }).name !== "RenderingCancelledException") {
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
      // Keep completed pixels. Returning to a screen must never destroy useful
      // work and force the same official PDF page to render again.
    };
  }, [page, priority]);

  return (
    <canvas
      ref={canvasRef}
      className={`remote-card-art ${failed ? "remote-card-art-failed" : ""} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={name}
      data-page={page}
    />
  );
}

export const RemoteCardArt = memo(RemoteCardArtComponent);
RemoteCardArt.displayName = "RemoteCardArt";

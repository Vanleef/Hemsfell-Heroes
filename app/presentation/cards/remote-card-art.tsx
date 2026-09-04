"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const CATALOG_URL = "/api/hemsfell-card-catalog.pdf";
const MAX_CACHED_PAGE_PROMISES = 48;
const MAX_CACHED_RASTER_PROMISES = 48;
const MAX_CACHED_RASTER_CSS_WIDTH = 240;
const MIN_COMPONENT_RASTER_CSS_WIDTH = 64;
const RASTER_WIDTH_STEP = 16;
const RANGE_CHUNK_SIZE = 512 * 1024;
const PREWARM_CONCURRENCY = 4;
let catalogPromise: Promise<import("pdfjs-dist").PDFDocumentProxy> | null = null;
const pagePromises = new Map<number, Promise<import("pdfjs-dist").PDFPageProxy>>();
const rasterPromises = new Map<string, Promise<HTMLCanvasElement>>();

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
      throw error;
    });
  }
  return catalogPromise;
}

/** Start the PDF worker/metadata request before the first match card needs art. */
export async function preloadRemoteCardCatalog() {
  await loadCatalog();
}

/** Reuse PDF page proxies when a card appears in hand, board and inspector. */
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
    while (pagePromises.size > MAX_CACHED_PAGE_PROMISES) {
      const oldest = pagePromises.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      pagePromises.delete(oldest);
    }
  }
  return pending;
}

function cardPixelRatio() {
  return Math.min(globalThis.devicePixelRatio || 1, 1.5);
}

function rasterWidthBucket(cssWidth: number) {
  const normalized = Math.max(MIN_COMPONENT_RASTER_CSS_WIDTH, Math.min(MAX_CACHED_RASTER_CSS_WIDTH, cssWidth));
  return Math.ceil(normalized / RASTER_WIDTH_STEP) * RASTER_WIDTH_STEP;
}

function rasterKey(page: number, cssWidth: number, pixelRatio: number) {
  return `${page}:${rasterWidthBucket(cssWidth)}:${pixelRatio.toFixed(2)}`;
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

/** Cache the expensive PDF raster for normal match-card sizes. Multiple copies
 * of the same card (hand/field/preview) then perform only a cheap drawImage. */
function loadCardRaster(page: number, cssWidth: number) {
  const pixelRatio = cardPixelRatio();
  const bucket = rasterWidthBucket(cssWidth);
  const key = rasterKey(page, bucket, pixelRatio);
  let pending = rasterPromises.get(key);
  if (pending) {
    rasterPromises.delete(key);
    rasterPromises.set(key, pending);
    return pending;
  }

  pending = renderPdfPageToCanvas(document.createElement("canvas"), page, bucket, pixelRatio)
    .catch((error) => {
      rasterPromises.delete(key);
      throw error;
    });
  rasterPromises.set(key, pending);
  while (rasterPromises.size > MAX_CACHED_RASTER_PROMISES) {
    const oldest = rasterPromises.keys().next().value as string | undefined;
    if (oldest === undefined || oldest === key) break;
    rasterPromises.delete(oldest);
  }
  return pending;
}

/** Warm only cards the user can currently see. The bounded worker pool avoids a
 * burst of dozens of simultaneous PDF renders while still getting the whole
 * hand ready much sooner than one independent cold path per component. */
export async function prewarmRemoteCardArtPages(pages: readonly number[], cssWidth = MIN_COMPONENT_RASTER_CSS_WIDTH) {
  const queue = [...new Set(pages.filter((page) => Number.isFinite(page) && page > 0))];
  if (!queue.length) return;
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const page = queue[cursor++];
      try {
        await loadCardRaster(page, cssWidth);
      } catch {
        // The mounted RemoteCardArt keeps its own error/fallback path.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREWARM_CONCURRENCY, queue.length) }, worker));
}

async function paintCardArt(canvas: HTMLCanvasElement, page: number, cssWidth: number) {
  // Kick the shared PDF-page promise before measuring/copying the raster. This
  // preserves the eager-page contract while the raster cache owns rendering.
  void loadCatalogPage(page);
  const width = Math.max(cssWidth, canvas.clientWidth, MIN_COMPONENT_RASTER_CSS_WIDTH);
  if (width <= MAX_CACHED_RASTER_CSS_WIDTH) {
    const raster = await loadCardRaster(page, width);
    canvas.width = raster.width;
    canvas.height = raster.height;
    canvas.style.aspectRatio = raster.style.aspectRatio;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas indisponível");
    context.drawImage(raster, 0, 0);
    canvas.dataset.loaded = "true";
    return;
  }

  await renderPdfPageToCanvas(canvas, page, width, cardPixelRatio());
  canvas.dataset.loaded = "true";
}

export async function renderRemoteCardArtToCanvas(canvas: HTMLCanvasElement, page: number, cssWidth = 120) {
  await paintCardArt(canvas, page, cssWidth);
}

type RemoteCardArtProps = {
  page: number;
  name: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
};

export function RemoteCardArt({ page, name, className = "", style, priority = false }: RemoteCardArtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const shouldRender = priority || visible;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || priority) return;
    if (!("IntersectionObserver" in globalThis)) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const mobile = matchMedia("(max-width: 48rem), (pointer: coarse)").matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: mobile ? "260px" : "440px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (!shouldRender) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    void paintCardArt(canvas, page, Math.max(canvas.clientWidth, MIN_COMPONENT_RASTER_CSS_WIDTH))
      .then(() => {
        if (!cancelled) setFailed(false);
      })
      .catch((error: unknown) => {
        if (!cancelled && (error as { name?: string }).name !== "RenderingCancelledException") setFailed(true);
      });

    return () => {
      cancelled = true;
      /* Keep the raster painted. Clearing canvas dimensions on every visibility
         transition forced PDF.js to render the same card again when returning
         to the hand/board and caused visible loading stalls. */
    };
  }, [page, shouldRender]);

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

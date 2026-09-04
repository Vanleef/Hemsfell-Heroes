"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const CATALOG_URL = "/api/hemsfell-card-catalog.pdf";
const MAX_CACHED_PAGE_PROMISES = 48;
let catalogPromise: Promise<import("pdfjs-dist").PDFDocumentProxy> | null = null;
const pagePromises = new Map<number, Promise<import("pdfjs-dist").PDFPageProxy>>();

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
        rangeChunkSize: 256 * 1024,
      }).promise;
    }).catch((error) => {
      catalogPromise = null;
      pagePromises.clear();
      throw error;
    });
  }
  return catalogPromise;
}

/** Reuse PDF page proxies when a card appears in hand, board and inspector. */
function loadCatalogPage(page: number) {
  let pending = pagePromises.get(page);
  if (pending) {
    // Refresh insertion order so frequently visible battlefield pages survive eviction.
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

export async function renderRemoteCardArtToCanvas(canvas: HTMLCanvasElement, page: number, cssWidth = 120) {
  const pdfPage = await loadCatalogPage(page);
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const width = Math.max(cssWidth, canvas.clientWidth, 120);
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
  const viewport = pdfPage.getViewport({ scale: (width / baseViewport.width) * pixelRatio });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas indisponível");
  const renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
  await renderTask.promise;
  canvas.dataset.loaded = "true";
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
    if (!canvas) return;
    if (priority) return;
    if (!("IntersectionObserver" in globalThis)) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const mobile = matchMedia("(max-width: 48rem), (pointer: coarse)").matches;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: mobile ? "160px" : "320px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (!shouldRender) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let renderTask: import("pdfjs-dist").RenderTask | undefined;

    void loadCatalogPage(page)
      .then(async (pdfPage) => {
        if (cancelled) return;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const cssWidth = Math.max(canvas.clientWidth, 120);
        const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
        const viewport = pdfPage.getViewport({ scale: (cssWidth / baseViewport.width) * pixelRatio });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas indisponível");
        renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) {
          canvas.dataset.loaded = "true";
          setFailed(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && (error as { name?: string }).name !== "RenderingCancelledException") setFailed(true);
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      if (!priority && canvas) {
        canvas.width = 1;
        canvas.height = 1;
        delete canvas.dataset.loaded;
      }
    };
  }, [page, priority, shouldRender]);

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

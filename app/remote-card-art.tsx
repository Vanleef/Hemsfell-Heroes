"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const CATALOG_URL = "/api/hemsfell-card-catalog.pdf";
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
        disableRange: true,
        disableStream: true,
      }).promise;
    });
  }
  return catalogPromise;
}

/** Reuse PDF page proxies when a card appears in hand, board and inspector. */
function loadCatalogPage(page: number) {
  let pending = pagePromises.get(page);
  if (!pending) {
    pending = loadCatalog().then((catalog) => {
      if (page < 1 || page > catalog.numPages) throw new Error("Card page is outside the catalogue");
      return catalog.getPage(page);
    });
    pagePromises.set(page, pending);
  }
  return pending;
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
  const [visible, setVisible] = useState(priority);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (priority || !("IntersectionObserver" in globalThis)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { rootMargin: "360px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: import("pdfjs-dist").RenderTask | undefined;

    setFailed(false);
    void loadCatalogPage(page)
      .then(async (pdfPage) => {
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
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
        if (!cancelled) canvas.dataset.loaded = "true";
      })
      .catch((error: unknown) => {
        if (!cancelled && (error as { name?: string }).name !== "RenderingCancelledException") setFailed(true);
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [page, visible]);

  return (
    <canvas
      ref={canvasRef}
      className={`remote-card-art ${failed ? "remote-card-art-failed" : ""} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={name}
      data-page={page}
      title={failed ? `${name} — arte remota temporariamente indisponível` : name}
    />
  );
}

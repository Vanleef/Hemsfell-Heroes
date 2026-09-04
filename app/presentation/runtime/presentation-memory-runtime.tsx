"use client";

import { useEffect } from "react";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const PRESENTATION_IDLE_EVENT = "hemsfell:presentation-idle";
const PRESENTATION_CATCH_UP_EVENT = "hemsfell:presentation-catch-up";

function releaseCanvasBackingStore(canvas: HTMLCanvasElement) {
  if (canvas.isConnected) return;
  try {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  } catch {
    // A detached canvas can already have lost its context; dimensions still
    // release the native/GPU backing store in that case.
  }
  canvas.width = 0;
  canvas.height = 0;
}

function releaseDetachedGraphics(root: Element) {
  if (root.isConnected) return;
  if (root instanceof HTMLCanvasElement) releaseCanvasBackingStore(root);
  root.querySelectorAll<HTMLCanvasElement>("canvas").forEach(releaseCanvasBackingStore);
}

/**
 * Presentation cards intentionally use detached DOM clones so the authoritative
 * React card never appears twice. Canvas backing stores on those short-lived
 * clones are native resources and can survive JS collection for a long time.
 * Release them immediately after the browser confirms the removed subtree was
 * not reconnected by React.
 */
export default function PresentationMemoryRuntime() {
  useEffect(() => {
    const idleWindow = window as IdleWindow;
    const pending = new Set<Element>();
    let handle = 0;
    let usingIdleCallback = false;

    const flush = () => {
      handle = 0;
      usingIdleCallback = false;
      const roots = [...pending];
      pending.clear();
      roots.forEach(releaseDetachedGraphics);
    };

    const schedule = () => {
      if (handle || !pending.size) return;
      if (idleWindow.requestIdleCallback) {
        usingIdleCallback = true;
        handle = idleWindow.requestIdleCallback(flush, { timeout: 240 });
      } else {
        handle = window.setTimeout(flush, 32);
      }
    };

    const collect = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (node instanceof HTMLCanvasElement || node.querySelector("canvas")) pending.add(node);
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) record.removedNodes.forEach(collect);
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onPresentationSettled = () => schedule();
    window.addEventListener(PRESENTATION_IDLE_EVENT, onPresentationSettled);
    window.addEventListener(PRESENTATION_CATCH_UP_EVENT, onPresentationSettled);

    return () => {
      observer.disconnect();
      window.removeEventListener(PRESENTATION_IDLE_EVENT, onPresentationSettled);
      window.removeEventListener(PRESENTATION_CATCH_UP_EVENT, onPresentationSettled);
      if (handle) {
        if (usingIdleCallback) idleWindow.cancelIdleCallback?.(handle);
        else window.clearTimeout(handle);
      }
      flush();
    };
  }, []);

  return null;
}

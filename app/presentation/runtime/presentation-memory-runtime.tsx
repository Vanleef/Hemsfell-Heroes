"use client";

import { useEffect } from "react";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  __hemsfellPresentationBusy?: boolean;
};

const PRESENTATION_IDLE_EVENT = "hemsfell:presentation-idle";
const PRESENTATION_CATCH_UP_EVENT = "hemsfell:presentation-catch-up";
const TEMPORARY_PRESENTATION_SELECTOR = [
  ".hh-flight-face",
  ".hh-state-hold",
  ".hh-hero-life-hold",
  ".hh-pile-count-hold",
  ".hh-arrival-ring",
  ".hh-destruction-ring",
  ".hh-banish-vortex",
  ".hh-effect-beam",
  ".hh-spell-impact",
].join(",");
const TEMPORARY_PRESENTATION_SAFETY_MS = 12_000;
const TEMPORARY_SWEEP_MS = 2_000;

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

function temporaryNodesWithin(root: Element) {
  const nodes: Element[] = [];
  if (root.matches(TEMPORARY_PRESENTATION_SELECTOR)) nodes.push(root);
  root.querySelectorAll(TEMPORARY_PRESENTATION_SELECTOR).forEach((node) => nodes.push(node));
  return nodes;
}

/**
 * Releases both detached canvas backing stores and connected presentation
 * leftovers. Normal animations remove their own nodes; the tracked deadline is
 * only a safety net for interrupted animations/errors. Presentation-idle is a
 * stronger signal and clears any leftover clone immediately after the ordered
 * transaction has completed.
 */
export default function PresentationMemoryRuntime() {
  useEffect(() => {
    const idleWindow = window as IdleWindow;
    const pending = new Set<Element>();
    const temporary = new Map<Element, number>();
    let handle = 0;
    let usingIdleCallback = false;
    let safetyTimer = 0;

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

    const collectRemoved = (node: Node) => {
      if (!(node instanceof Element)) return;
      temporary.delete(node);
      temporaryNodesWithin(node).forEach((child) => temporary.delete(child));
      if (node instanceof HTMLCanvasElement || node.querySelector("canvas")) pending.add(node);
    };

    const collectAdded = (node: Node) => {
      if (!(node instanceof Element)) return;
      const now = performance.now();
      temporaryNodesWithin(node).forEach((element) => {
        if (!temporary.has(element)) temporary.set(element, now);
      });
    };

    const releaseTemporary = (node: Element) => {
      temporary.delete(node);
      if (!node.isConnected) {
        releaseDetachedGraphics(node);
        return;
      }
      node.remove();
      releaseDetachedGraphics(node);
    };

    const sweepTemporary = (settled = false) => {
      const now = performance.now();
      if (idleWindow.__hemsfellPresentationBusy) return;
      for (const [node, createdAt] of temporary) {
        if (!node.isConnected) {
          temporary.delete(node);
          releaseDetachedGraphics(node);
          continue;
        }
        if (settled || now - createdAt >= TEMPORARY_PRESENTATION_SAFETY_MS) releaseTemporary(node);
      }
    };

    safetyTimer = window.setInterval(() => sweepTemporary(false), TEMPORARY_SWEEP_MS);
    document.querySelectorAll(TEMPORARY_PRESENTATION_SELECTOR).forEach((node) => temporary.set(node, performance.now()));

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.removedNodes.forEach(collectRemoved);
        record.addedNodes.forEach(collectAdded);
      }
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onPresentationSettled = () => {
      schedule();
      sweepTemporary(true);
    };
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
      if (safetyTimer) window.clearInterval(safetyTimer);
      // Match-runtime unmount is a hard context boundary: no presentation clone
      // should survive it, even if an animation promise was interrupted.
      [...temporary.keys()].forEach(releaseTemporary);
      flush();
    };
  }, []);

  return null;
}

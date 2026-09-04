"use client";

import { useEffect } from "react";
import { prewarmRemoteCardArtPages, promoteRemoteCardArtPage } from "./remote-card-art";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const COLLECTION_ROOT = ".screen-decks";
const SELECTED_HERO_SELECTOR = ".screen-decks .collection-hero-inspect canvas.remote-card-art[data-page],.screen-decks .deck-rail button.active canvas.remote-card-art[data-page]";
const SELECTED_DECK_CARD_SELECTOR = ".screen-decks .collection-lists .card-library canvas.remote-card-art[data-page]";
const COMPACT_WIDTH = 144;
const VISIBLE_WIDTH = 240;
const BACKGROUND_IDLE_TIMEOUT_MS = 700;

const constrained = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse), (max-width: 48rem)").matches;
const pageOf = (canvas: HTMLCanvasElement) => Number(canvas.dataset.page || 0);

function uniquePages(canvases: readonly HTMLCanvasElement[]) {
  return [...new Set(canvases.map(pageOf).filter((page) => Number.isFinite(page) && page > 0))];
}

function isViewportVisible(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

/**
 * Collection-specific second-stage scheduler.
 * The global art runtime owns the shared queue/cache. This runtime only gives
 * the currently selected deck a stronger ordering than unrelated idle work:
 * selected hero (already browser-high in CardArtWarmupRuntime), visible deck
 * cards, a short eager deck prefix, then the rest of this selected deck.
 */
export default function CollectionSelectedDeckPriorityRuntime() {
  useEffect(() => {
    const idleWindow = window as IdleWindow;
    let disposed = false;
    let frame = 0;
    let idleHandle = 0;
    let idleUsesCallback = false;
    let currentSignature = "";
    let deckController = new AbortController();

    const cancelIdle = () => {
      if (!idleHandle) return;
      if (idleUsesCallback) idleWindow.cancelIdleCallback?.(idleHandle);
      else window.clearTimeout(idleHandle);
      idleHandle = 0;
      idleUsesCallback = false;
    };

    const resetDeckWork = () => {
      deckController.abort();
      deckController = new AbortController();
      cancelIdle();
    };

    const scheduleBackground = (pages: number[]) => {
      if (!pages.length) return;
      const signal = deckController.signal;
      const run = () => {
        idleHandle = 0;
        idleUsesCallback = false;
        if (disposed || signal.aborted || !document.querySelector(COLLECTION_ROOT)) return;
        void prewarmRemoteCardArtPages(pages, COMPACT_WIDTH, {
          priority: 2,
          concurrency: 1,
          signal,
        }).catch(() => undefined);
      };
      if (idleWindow.requestIdleCallback) {
        idleUsesCallback = true;
        idleHandle = idleWindow.requestIdleCallback(run, { timeout: BACKGROUND_IDLE_TIMEOUT_MS });
      } else {
        idleHandle = window.setTimeout(run, 420);
      }
    };

    const sync = () => {
      frame = 0;
      if (disposed) return;
      const root = document.querySelector(COLLECTION_ROOT);
      if (!root) {
        if (currentSignature) {
          currentSignature = "";
          resetDeckWork();
        }
        return;
      }

      const selectedHeroCanvas = document.querySelector<HTMLCanvasElement>(SELECTED_HERO_SELECTOR);
      const heroPage = selectedHeroCanvas ? pageOf(selectedHeroCanvas) : 0;
      const canvases = [...document.querySelectorAll<HTMLCanvasElement>(SELECTED_DECK_CARD_SELECTOR)];
      const deckPages = uniquePages(canvases);
      const signature = `${heroPage}:${deckPages.join(",")}`;
      const signatureChanged = signature !== currentSignature;
      if (signatureChanged) {
        currentSignature = signature;
        resetDeckWork();
      }

      const visiblePages = uniquePages(canvases.filter(isViewportVisible));
      visiblePages.forEach((page) => promoteRemoteCardArtPage(page, 0, true));
      if (visiblePages.length) {
        void prewarmRemoteCardArtPages(visiblePages, VISIBLE_WIDTH, {
          priority: 0,
          concurrency: constrained() ? 1 : 2,
          signal: deckController.signal,
        }).catch(() => undefined);
      }

      if (!signatureChanged || !deckPages.length) return;

      const visibleSet = new Set(visiblePages);
      const eagerCount = constrained() ? 8 : 14;
      const eagerPages = deckPages.filter((page) => !visibleSet.has(page)).slice(0, eagerCount);
      eagerPages.forEach((page) => promoteRemoteCardArtPage(page, 1, false));
      if (eagerPages.length) {
        void prewarmRemoteCardArtPages(eagerPages, COMPACT_WIDTH, {
          priority: 1,
          concurrency: constrained() ? 1 : 2,
          signal: deckController.signal,
        }).catch(() => undefined);
      }

      const eagerSet = new Set(eagerPages);
      const rest = deckPages.filter((page) => !visibleSet.has(page) && !eagerSet.has(page));
      scheduleBackground(rest);
    };

    const schedule = () => {
      if (frame || disposed) return;
      frame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-page"] });
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule, { passive: true });
    document.addEventListener("click", schedule, true);
    schedule();

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("click", schedule, true);
      if (frame) window.cancelAnimationFrame(frame);
      resetDeckWork();
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";
import {
  cleanupRemoteCardArtMemory,
  preloadRemoteCardCatalog,
  prewarmRemoteCardArtPages,
  promoteRemoteCardArtPage,
  setRemoteCardArtContext,
  type RemoteCardArtContext,
} from "./remote-card-art";

type HeroMeta = {
  id: string;
  page: number;
  start: number;
  end: number;
  src: string;
  position: string;
};

type HeroImagePriority = "high" | "auto" | "low";
type HeroImageRecord = {
  image: HTMLImageElement;
  ready: Promise<HTMLImageElement>;
  priority: HeroImagePriority;
};

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const HEROES: readonly HeroMeta[] = [
  { id: "gimble", page: 2, start: 3, end: 25, src: "/heroes/gimble.webp", position: "58% 18%" },
  { id: "goblin", page: 26, start: 27, end: 49, src: "/heroes/goblin.webp", position: "50% 19%" },
  { id: "uruk", page: 54, start: 55, end: 109, src: "/heroes/uruk.webp", position: "50% 20%" },
  { id: "tifon", page: 110, start: 111, end: 128, src: "/heroes/tifon.webp", position: "50% 22%" },
  { id: "saymon", page: 129, start: 130, end: 151, src: "/heroes/saymon.webp", position: "50% 18%" },
  { id: "tessalia", page: 152, start: 153, end: 179, src: "/heroes/tessalia.webp", position: "57% 18%" },
  { id: "quarion", page: 180, start: 181, end: 210, src: "/heroes/quarion.webp", position: "50% 18%" },
  { id: "rasmus", page: 211, start: 212, end: 254, src: "/heroes/rasmus.webp", position: "57% 17%" },
  { id: "ngoro", page: 255, start: 256, end: 272, src: "/heroes/ngoro.webp", position: "50% 17%" },
  { id: "zayan", page: 273, start: 274, end: 290, src: "/heroes/zayan.webp", position: "50% 19%" },
  { id: "natureza", page: 291, start: 292, end: 309, src: "/heroes/natureza.webp", position: "58% 20%" },
];

const HERO_BY_ID = new Map<string, HeroMeta>(HEROES.map((hero) => [hero.id, hero]));
const HERO_BY_PAGE = new Map<number, HeroMeta>(HEROES.map((hero) => [hero.page, hero]));
const heroImages = new Map<string, HeroImageRecord>();
const promotedPages = new Map<number, number>();
const CARD_PREWARM_WIDTH = 144;
const PROMOTED_CARD_WIDTH = 240;
const PROMOTION_THROTTLE_MS = 1800;
const CATALOGUE_WARMUP_DELAY_MS = 180;
const COLLECTION_BACKGROUND_IDLE_TIMEOUT_MS = 900;
const COLLECTION_NEIGHBOR_COUNT_MOBILE = 3;
const COLLECTION_NEIGHBOR_COUNT_DESKTOP = 5;

const numberPage = (canvas: HTMLCanvasElement) => Number(canvas.dataset.page || 0);
const isMatchMounted = () => !!document.querySelector(".screen-game .game-stage");
const isConstrained = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse), (max-width: 48rem)").matches;

function contextFromDom(): RemoteCardArtContext {
  const app = document.querySelector("main.hh-app");
  if (!app) return "other";
  if (app.classList.contains("screen-game")) return "match";
  if (app.classList.contains("screen-decks")) return "collection";
  if (app.classList.contains("screen-setup")) return "setup";
  if (app.classList.contains("screen-tutorial")) return "tutorial";
  if (app.classList.contains("screen-menu")) return "menu";
  return "other";
}

function heroImagePriorityRank(priority: HeroImagePriority) {
  return priority === "high" ? 0 : priority === "auto" ? 1 : 2;
}

function trimHeroImageCache(protectedIds: ReadonlySet<string>) {
  const limit = isConstrained() ? 3 : 6;
  while (heroImages.size > limit) {
    const oldest = [...heroImages.keys()].find((id) => !protectedIds.has(id));
    if (!oldest) break;
    heroImages.delete(oldest);
  }
}

function primeHeroImage(hero: HeroMeta, priority: HeroImagePriority) {
  const existing = heroImages.get(hero.id);
  if (existing) {
    if (heroImagePriorityRank(priority) < heroImagePriorityRank(existing.priority)) {
      existing.priority = priority;
      existing.image.setAttribute("fetchpriority", priority);
    }
    heroImages.delete(hero.id);
    heroImages.set(hero.id, existing);
    return existing.ready;
  }

  const image = new Image();
  image.decoding = "async";
  image.setAttribute("fetchpriority", priority);
  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`hero-art:${hero.id}`)), { once: true });
  });
  heroImages.set(hero.id, { image, ready, priority });
  image.src = hero.src;
  if (image.complete && image.naturalWidth > 0) return Promise.resolve(image);
  return ready;
}

function clearHeroCanvasOverride(canvas: HTMLCanvasElement) {
  canvas.style.removeProperty("background-image");
  canvas.style.removeProperty("background-size");
  canvas.style.removeProperty("background-position");
  canvas.style.removeProperty("background-repeat");
  delete canvas.dataset.hhCleanHeroArt;
}

function applyCleanHeroArt(canvas: HTMLCanvasElement, hero: HeroMeta, priority: HeroImagePriority) {
  if (canvas.closest(".screen-game .game-stage")) {
    clearHeroCanvasOverride(canvas);
    return;
  }

  if (canvas.dataset.hhCleanHeroArt === hero.id && canvas.dataset.artQuality === "clean-hero") {
    if (priority === "high") void primeHeroImage(hero, "high").catch(() => undefined);
    return;
  }

  canvas.dataset.hhHeroRequested = hero.id;
  void primeHeroImage(hero, priority).then(() => {
    if (!canvas.isConnected || numberPage(canvas) !== hero.page || canvas.closest(".screen-game .game-stage")) return;
    if (canvas.dataset.hhHeroRequested !== hero.id) return;
    try {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    } catch {
      // The local hero image is a visual fast path and never controls navigation.
    }
    canvas.style.backgroundImage = `url("${hero.src}")`;
    canvas.style.backgroundSize = "contain";
    canvas.style.backgroundPosition = "center bottom";
    canvas.style.backgroundRepeat = "no-repeat";
    canvas.dataset.hhCleanHeroArt = hero.id;
    canvas.dataset.loaded = "true";
    canvas.dataset.artQuality = "clean-hero";
    delete canvas.dataset.loading;
  }).catch(() => undefined);
}

function heroFromCanvas(canvas: HTMLCanvasElement | null) {
  return canvas ? HERO_BY_PAGE.get(numberPage(canvas)) : undefined;
}

function selectedHeroIds() {
  const ids = new Set<string>();

  document.querySelectorAll<HTMLSelectElement>(".deck-picker select").forEach((select) => {
    if (HERO_BY_ID.has(select.value)) ids.add(select.value);
  });

  document.querySelectorAll<HTMLCanvasElement>(
    ".deck-rail button.active canvas.remote-card-art[data-page], .collection-hero-inspect canvas.remote-card-art[data-page]",
  ).forEach((canvas) => {
    const hero = heroFromCanvas(canvas);
    if (hero) ids.add(hero.id);
  });

  const fan = Array.from(document.querySelectorAll<HTMLCanvasElement>(".hero-fan canvas.remote-card-art[data-page]"));
  const center = fan[Math.floor(fan.length / 2)];
  const centerHero = heroFromCanvas(center || null);
  if (centerHero) ids.add(centerHero.id);

  return ids;
}

function collectionSelectedHeroIds() {
  const ids = new Set<string>();
  document.querySelectorAll<HTMLCanvasElement>(
    ".screen-decks .deck-rail button.active canvas.remote-card-art[data-page], .screen-decks .collection-hero-inspect canvas.remote-card-art[data-page]",
  ).forEach((canvas) => {
    const hero = heroFromCanvas(canvas);
    if (hero) ids.add(hero.id);
  });
  return ids;
}

function pagesForHero(hero: HeroMeta) {
  return Array.from({ length: Math.max(0, hero.end - hero.start + 1) }, (_, index) => hero.start + index);
}

function cardCanvasFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest(".screen-game .game-stage")) return null;
  if (target.matches("canvas.remote-card-art[data-page]")) return target as HTMLCanvasElement;
  const scope = target.closest(
    ".original-card,.card-frame,.deck-picker,.deck-rail button,.collection-hero-inspect,.hero-fan,.card-library,.collection-lists",
  );
  return scope?.querySelector<HTMLCanvasElement>("canvas.remote-card-art[data-page]") || null;
}

function recentPromotedPages(now = performance.now()) {
  const pages: number[] = [];
  for (const [page, timestamp] of promotedPages) {
    if (now - timestamp > PROMOTION_THROTTLE_MS) {
      promotedPages.delete(page);
      continue;
    }
    pages.push(page);
  }
  return pages;
}

/**
 * Global out-of-match coordinator. The expensive PDF renderer remains shared,
 * but user intent now has a strict order: selected/focus -> viewport -> nearby
 * in scroll direction -> idle background. Screen changes also switch the LRU
 * budget immediately so collection/setup cannot keep match-sized memory alive.
 */
export default function CardArtWarmupRuntime() {
  useEffect(() => {
    const idleWindow = window as IdleWindow;
    let disposed = false;
    let syncFrame = 0;
    let directionFrame = 0;
    let catalogueTimer = 0;
    let currentContext: RemoteCardArtContext = contextFromDom();
    let currentApp: Element | null = null;
    let collectionDirection: 1 | -1 = 1;
    let collectionBackgroundHero = "";
    let collectionBackgroundIdle = 0;
    let collectionBackgroundUsesIdle = false;
    let collectionController = new AbortController();
    let contextController = new AbortController();
    const scrollPositions = new Map<EventTarget, { top: number; left: number }>();
    const observedHeroCanvases = new Set<HTMLCanvasElement>();
    const observedCollectionCanvases = new Set<HTMLCanvasElement>();
    const collectionVisibleCanvases = new Set<HTMLCanvasElement>();

    const appObserver = new MutationObserver(() => scheduleSync());

    const visibleHeroObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLCanvasElement)) continue;
        const canvas = entry.target;
        const hero = heroFromCanvas(canvas);
        if (!hero) continue;
        const selected = selectedHeroIds().has(hero.id);
        applyCleanHeroArt(canvas, hero, selected ? "high" : "auto");
        visibleHeroObserver?.unobserve(canvas);
      }
    }, { rootMargin: "0px" });

    const nearHeroObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLCanvasElement)) continue;
        const canvas = entry.target;
        const hero = heroFromCanvas(canvas);
        if (!hero) continue;
        applyCleanHeroArt(canvas, hero, "low");
        nearHeroObserver?.unobserve(canvas);
      }
    }, { rootMargin: isConstrained() ? "72px 0px" : "140px 0px" });

    const collectionViewportObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLCanvasElement)) continue;
        const canvas = entry.target;
        if (entry.isIntersecting) {
          collectionVisibleCanvases.add(canvas);
          const page = numberPage(canvas);
          if (page > 0 && !HERO_BY_PAGE.has(page)) {
            promoteRemoteCardArtPage(page, 1, false);
            void prewarmRemoteCardArtPages([page], CARD_PREWARM_WIDTH, {
              priority: 1,
              concurrency: 1,
              signal: contextController.signal,
            }).catch(() => undefined);
          }
        } else {
          collectionVisibleCanvases.delete(canvas);
        }
      }
      scheduleDirectionalPrefetch();
    }, { rootMargin: "0px", threshold: 0.01 });

    const clearCatalogueTimer = () => {
      if (!catalogueTimer) return;
      window.clearTimeout(catalogueTimer);
      catalogueTimer = 0;
    };

    const scheduleCatalogueWarm = (context: RemoteCardArtContext) => {
      clearCatalogueTimer();
      if (context !== "setup" && context !== "collection") return;
      catalogueTimer = window.setTimeout(() => {
        catalogueTimer = 0;
        if (disposed || contextFromDom() !== context) return;
        void preloadRemoteCardCatalog().catch(() => undefined);
      }, CATALOGUE_WARMUP_DELAY_MS);
    };

    const cancelCollectionBackground = () => {
      collectionController.abort();
      collectionController = new AbortController();
      collectionBackgroundHero = "";
      if (collectionBackgroundIdle) {
        if (collectionBackgroundUsesIdle) idleWindow.cancelIdleCallback?.(collectionBackgroundIdle);
        else window.clearTimeout(collectionBackgroundIdle);
      }
      collectionBackgroundIdle = 0;
      collectionBackgroundUsesIdle = false;
    };

    const startCollectionBackground = (hero: HeroMeta) => {
      if (collectionBackgroundHero === hero.id) return;
      cancelCollectionBackground();
      collectionBackgroundHero = hero.id;
      const signal = collectionController.signal;
      const run = () => {
        collectionBackgroundIdle = 0;
        collectionBackgroundUsesIdle = false;
        if (signal.aborted || contextFromDom() !== "collection") return;
        void prewarmRemoteCardArtPages(pagesForHero(hero), CARD_PREWARM_WIDTH, {
          priority: 3,
          concurrency: 1,
          signal,
        }).catch(() => undefined);
      };
      if (idleWindow.requestIdleCallback) {
        collectionBackgroundUsesIdle = true;
        collectionBackgroundIdle = idleWindow.requestIdleCallback(run, { timeout: COLLECTION_BACKGROUND_IDLE_TIMEOUT_MS });
      } else {
        collectionBackgroundIdle = window.setTimeout(run, 650);
      }
    };

    const bindAppObserver = () => {
      const app = document.querySelector("main.hh-app");
      if (app === currentApp) return;
      appObserver.disconnect();
      currentApp = app;
      if (app) appObserver.observe(app, { attributes: true, attributeFilter: ["class"] });
    };

    const syncHeroCanvases = (selected: Set<string>) => {
      for (const canvas of observedHeroCanvases) {
        if (canvas.isConnected && !canvas.closest(".screen-game .game-stage")) continue;
        visibleHeroObserver?.unobserve(canvas);
        nearHeroObserver?.unobserve(canvas);
        observedHeroCanvases.delete(canvas);
      }

      if (isMatchMounted()) return;

      document.querySelectorAll<HTMLCanvasElement>("canvas.remote-card-art[data-page]").forEach((canvas) => {
        const hero = heroFromCanvas(canvas);
        if (!hero) return;
        if (selected.has(hero.id)) {
          applyCleanHeroArt(canvas, hero, "high");
          return;
        }
        if (observedHeroCanvases.has(canvas)) return;
        observedHeroCanvases.add(canvas);
        if (!visibleHeroObserver || !nearHeroObserver) {
          applyCleanHeroArt(canvas, hero, "auto");
          return;
        }
        nearHeroObserver.observe(canvas);
        visibleHeroObserver.observe(canvas);
      });
    };

    const syncCollectionCanvases = () => {
      for (const canvas of observedCollectionCanvases) {
        if (canvas.isConnected && canvas.closest(".screen-decks")) continue;
        collectionViewportObserver?.unobserve(canvas);
        observedCollectionCanvases.delete(canvas);
        collectionVisibleCanvases.delete(canvas);
      }
      if (currentContext !== "collection" || !collectionViewportObserver) return;
      document.querySelectorAll<HTMLCanvasElement>(".screen-decks canvas.remote-card-art[data-page]").forEach((canvas) => {
        if (HERO_BY_PAGE.has(numberPage(canvas)) || observedCollectionCanvases.has(canvas)) return;
        observedCollectionCanvases.add(canvas);
        collectionViewportObserver.observe(canvas);
      });
    };

    function directionalNeighborPages() {
      if (currentContext !== "collection" || !collectionVisibleCanvases.size) return [] as number[];
      const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>(".screen-decks canvas.remote-card-art[data-page]"))
        .filter((canvas) => !HERO_BY_PAGE.has(numberPage(canvas)));
      const visibleIndices = canvases.flatMap((canvas, index) => collectionVisibleCanvases.has(canvas) ? [index] : []);
      if (!visibleIndices.length) return [];
      const count = isConstrained() ? COLLECTION_NEIGHBOR_COUNT_MOBILE : COLLECTION_NEIGHBOR_COUNT_DESKTOP;
      const pages: number[] = [];
      if (collectionDirection > 0) {
        for (let index = Math.max(...visibleIndices) + 1; index < canvases.length && pages.length < count; index += 1) {
          const page = numberPage(canvases[index]);
          if (page > 0) pages.push(page);
        }
      } else {
        for (let index = Math.min(...visibleIndices) - 1; index >= 0 && pages.length < count; index -= 1) {
          const page = numberPage(canvases[index]);
          if (page > 0) pages.push(page);
        }
      }
      return pages;
    }

    function scheduleDirectionalPrefetch() {
      if (directionFrame || disposed || currentContext !== "collection") return;
      directionFrame = window.requestAnimationFrame(() => {
        directionFrame = 0;
        const pages = directionalNeighborPages();
        if (!pages.length) return;
        pages.forEach((page) => promoteRemoteCardArtPage(page, 2, false));
        void prewarmRemoteCardArtPages(pages, CARD_PREWARM_WIDTH, {
          priority: 2,
          concurrency: 1,
          signal: contextController.signal,
        }).catch(() => undefined);
      });
    }

    const promoteCardAtTarget = (target: EventTarget | null) => {
      const canvas = cardCanvasFromTarget(target);
      if (!canvas) return;
      const page = numberPage(canvas);
      if (!Number.isFinite(page) || page <= 0) return;

      const hero = HERO_BY_PAGE.get(page);
      if (hero) {
        applyCleanHeroArt(canvas, hero, "high");
        return;
      }

      const now = performance.now();
      if (now - (promotedPages.get(page) || 0) < PROMOTION_THROTTLE_MS) {
        promoteRemoteCardArtPage(page, 0, true);
        return;
      }
      promotedPages.set(page, now);
      promoteRemoteCardArtPage(page, 0, true);
      void prewarmRemoteCardArtPages([page], PROMOTED_CARD_WIDTH, {
        priority: 0,
        concurrency: 1,
        signal: contextController.signal,
      }).catch(() => undefined);
    };

    const switchContext = (next: RemoteCardArtContext, selected: Set<string>) => {
      if (next === currentContext) return;
      contextController.abort();
      contextController = new AbortController();
      cancelCollectionBackground();
      collectionVisibleCanvases.clear();
      scrollPositions.clear();
      cleanupRemoteCardArtMemory(recentPromotedPages());
      currentContext = next;
      scheduleCatalogueWarm(next);
      const selectedPages = [...selected].map((id) => HERO_BY_ID.get(id)?.page || 0).filter(Boolean);
      setRemoteCardArtContext(next, [...selectedPages, ...recentPromotedPages()]);
    };

    const sync = () => {
      syncFrame = 0;
      if (disposed) return;
      bindAppObserver();
      const selected = selectedHeroIds();
      const nextContext = contextFromDom();
      switchContext(nextContext, selected);
      const hotPages = [
        ...[...selected].map((id) => HERO_BY_ID.get(id)?.page || 0).filter(Boolean),
        ...recentPromotedPages(),
      ];
      setRemoteCardArtContext(currentContext, hotPages);
      syncHeroCanvases(selected);
      syncCollectionCanvases();

      selected.forEach((id) => {
        const hero = HERO_BY_ID.get(id);
        if (hero) void primeHeroImage(hero, "high").catch(() => undefined);
      });
      trimHeroImageCache(selected);

      if (currentContext === "collection") {
        const selectedCollection = collectionSelectedHeroIds();
        const hero = [...selectedCollection].map((id) => HERO_BY_ID.get(id)).find(Boolean);
        if (hero) startCollectionBackground(hero);
        else cancelCollectionBackground();
      } else {
        cancelCollectionBackground();
      }
    };

    const scheduleSync = () => {
      if (syncFrame || disposed) return;
      syncFrame = window.requestAnimationFrame(sync);
    };

    const onChange = (event: Event) => {
      const select = event.target instanceof HTMLSelectElement ? event.target : null;
      if (select?.closest(".deck-picker")) {
        const hero = HERO_BY_ID.get(select.value);
        if (hero) void primeHeroImage(hero, "high").catch(() => undefined);
      }
      scheduleSync();
    };

    const onPriorityInteraction = (event: Event) => promoteCardAtTarget(event.target);
    const onPointerDown = (event: Event) => {
      promoteCardAtTarget(event.target);
      scheduleSync();
    };

    const onScroll = (event: Event) => {
      if (currentContext !== "collection") return;
      const target = event.target || document;
      let top = window.scrollY;
      let left = window.scrollX;
      if (target instanceof HTMLElement) {
        top = target.scrollTop;
        left = target.scrollLeft;
      }
      const previous = scrollPositions.get(target) || { top, left };
      const dy = top - previous.top;
      const dx = left - previous.left;
      scrollPositions.set(target, { top, left });
      const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      if (Math.abs(delta) > 1) collectionDirection = delta > 0 ? 1 : -1;
      scheduleDirectionalPrefetch();
    };

    const observer = new MutationObserver((records) => {
      const needsSync = records.some((record) => {
        if (record.type === "childList") return true;
        return record.target instanceof HTMLCanvasElement && record.attributeName === "data-page";
      });
      if (needsSync) scheduleSync();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-page"],
    });

    document.addEventListener("change", onChange, true);
    document.addEventListener("pointerover", onPriorityInteraction, true);
    document.addEventListener("focusin", onPriorityInteraction, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("scroll", onScroll, true);

    bindAppObserver();
    const initialSelected = selectedHeroIds();
    setRemoteCardArtContext(currentContext, [...initialSelected].map((id) => HERO_BY_ID.get(id)?.page || 0).filter(Boolean));
    scheduleCatalogueWarm(currentContext);
    sync();

    return () => {
      disposed = true;
      observer.disconnect();
      appObserver.disconnect();
      visibleHeroObserver?.disconnect();
      nearHeroObserver?.disconnect();
      collectionViewportObserver?.disconnect();
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("pointerover", onPriorityInteraction, true);
      document.removeEventListener("focusin", onPriorityInteraction, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", onScroll, true);
      contextController.abort();
      cancelCollectionBackground();
      clearCatalogueTimer();
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      if (directionFrame) window.cancelAnimationFrame(directionFrame);
      cleanupRemoteCardArtMemory(recentPromotedPages());
    };
  }, []);

  return null;
}

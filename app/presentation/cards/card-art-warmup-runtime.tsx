"use client";

import { useEffect } from "react";
import { preloadRemoteCardCatalog, prewarmRemoteCardArtPages } from "./remote-card-art";

type HeroMeta = {
  id: string;
  page: number;
  start: number;
  end: number;
  src: string;
  position: string;
};

type HeroImageRecord = {
  image: HTMLImageElement;
  ready: Promise<HTMLImageElement>;
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
const FRONT_DECK_PREWARM_COUNT = 5;
const CARD_PREWARM_WIDTH = 144;
const PROMOTED_CARD_WIDTH = 240;
const PROMOTION_THROTTLE_MS = 1800;
const CATALOGUE_WARMUP_DELAY_MS = 80;

const isMatchMounted = () => !!document.querySelector(".screen-game .game-stage");
const numberPage = (canvas: HTMLCanvasElement) => Number(canvas.dataset.page || 0);

function primeHeroImage(hero: HeroMeta, highPriority: boolean) {
  const existing = heroImages.get(hero.id);
  if (existing) {
    if (highPriority) existing.image.setAttribute("fetchpriority", "high");
    return existing.ready;
  }

  const image = new Image();
  image.decoding = "async";
  image.setAttribute("fetchpriority", highPriority ? "high" : "auto");
  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`hero-art:${hero.id}`)), { once: true });
  });
  heroImages.set(hero.id, { image, ready });
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

function applyCleanHeroArt(canvas: HTMLCanvasElement, hero: HeroMeta, highPriority: boolean) {
  if (canvas.closest(".screen-game .game-stage")) {
    clearHeroCanvasOverride(canvas);
    return;
  }

  canvas.style.backgroundImage = `url("${hero.src}")`;
  canvas.style.backgroundSize = "cover";
  canvas.style.backgroundPosition = hero.position;
  canvas.style.backgroundRepeat = "no-repeat";

  if (canvas.dataset.hhCleanHeroArt === hero.id && canvas.dataset.artQuality === "clean-hero") {
    if (highPriority) void primeHeroImage(hero, true).catch(() => undefined);
    return;
  }

  void primeHeroImage(hero, highPriority).then(() => {
    if (!canvas.isConnected || numberPage(canvas) !== hero.page || canvas.closest(".screen-game .game-stage")) return;
    try {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    } catch {
      // Local hero art is a visual fast path; failure must never affect navigation.
    }
    canvas.dataset.hhCleanHeroArt = hero.id;
    canvas.dataset.loaded = "true";
    canvas.dataset.artQuality = "clean-hero";
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
    ".collection .deck-rail button.active canvas.remote-card-art[data-page], .collection .collection-hero-inspect canvas.remote-card-art[data-page]",
  ).forEach((canvas) => {
    const hero = heroFromCanvas(canvas);
    if (hero) ids.add(hero.id);
  });
  return ids;
}

function syncHeroCanvases(selected: Set<string>) {
  document.querySelectorAll<HTMLCanvasElement>("canvas.remote-card-art[data-hh-clean-hero-art]").forEach((canvas) => {
    if (!HERO_BY_PAGE.has(numberPage(canvas)) || canvas.closest(".screen-game .game-stage")) clearHeroCanvasOverride(canvas);
  });

  if (isMatchMounted()) return;

  document.querySelectorAll<HTMLCanvasElement>("canvas.remote-card-art[data-page]").forEach((canvas) => {
    const hero = heroFromCanvas(canvas);
    if (!hero) return;
    const contextualPriority = selected.has(hero.id)
      || !!canvas.closest(".deck-picker,.collection-hero-inspect,.deck-rail button.active");
    applyCleanHeroArt(canvas, hero, contextualPriority);
  });
}

function pagesForHero(hero: HeroMeta) {
  return Array.from({ length: Math.max(0, hero.end - hero.start + 1) }, (_, index) => hero.start + index);
}

function cardCanvasFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest(".screen-game .game-stage")) return null;
  if (target.matches("canvas.remote-card-art[data-page]")) return target as HTMLCanvasElement;
  const scope = target.closest(
    ".original-card,.card-frame,.deck-picker,.deck-rail button,.collection-hero-inspect,.hero-fan",
  );
  return scope?.querySelector<HTMLCanvasElement>("canvas.remote-card-art[data-page]") || null;
}

function promoteCardAtTarget(target: EventTarget | null) {
  const canvas = cardCanvasFromTarget(target);
  if (!canvas) return;
  const page = numberPage(canvas);
  if (!Number.isFinite(page) || page <= 0) return;

  const hero = HERO_BY_PAGE.get(page);
  if (hero) {
    applyCleanHeroArt(canvas, hero, true);
    return;
  }

  const now = performance.now();
  if (now - (promotedPages.get(page) || 0) < PROMOTION_THROTTLE_MS) return;
  promotedPages.set(page, now);
  void prewarmRemoteCardArtPages([page], PROMOTED_CARD_WIDTH, { priority: 0, concurrency: 1 }).catch(() => undefined);
}

/**
 * Global card-art warmup and out-of-match priority coordinator.
 *
 * PDF-backed cards still share one catalogue, but the currently selected hero,
 * focused/hovered card and the visible collection are promoted ahead of generic
 * background work. Hero portraits outside a match use the same lightweight clean
 * WEBP art as the in-match hero panel, painted as the canvas background so React
 * keeps owning the DOM node and PDF renders cannot create duplicate hero elements.
 */
export default function CardArtWarmupRuntime() {
  useEffect(() => {
    let syncFrame = 0;
    let disposed = false;
    let catalogueTimer = 0;
    const deckControllers = new Map<string, AbortController>();
    const deckTimers = new Map<string, number>();

    const stopDeckWarm = (id: string) => {
      deckControllers.get(id)?.abort();
      deckControllers.delete(id);
      const timer = deckTimers.get(id);
      if (timer != null) window.clearTimeout(timer);
      deckTimers.delete(id);
    };

    const startCollectionWarm = (hero: HeroMeta) => {
      if (deckControllers.has(hero.id)) return;
      const controller = new AbortController();
      deckControllers.set(hero.id, controller);
      const pages = pagesForHero(hero);
      const front = pages.slice(0, FRONT_DECK_PREWARM_COUNT);
      const background = pages.slice(FRONT_DECK_PREWARM_COUNT);

      void prewarmRemoteCardArtPages(front, CARD_PREWARM_WIDTH, {
        priority: 1,
        concurrency: 1,
        signal: controller.signal,
      }).then(() => {
        if (controller.signal.aborted || !background.length) return;
        const timer = window.setTimeout(() => {
          deckTimers.delete(hero.id);
          void prewarmRemoteCardArtPages(background, CARD_PREWARM_WIDTH, {
            priority: 2,
            concurrency: 1,
            signal: controller.signal,
          }).catch(() => undefined);
        }, 120);
        deckTimers.set(hero.id, timer);
      }).catch(() => undefined);
    };

    const sync = () => {
      syncFrame = 0;
      if (disposed) return;
      if (isMatchMounted()) {
        [...deckControllers.keys()].forEach(stopDeckWarm);
        syncHeroCanvases(new Set());
        return;
      }

      const selected = selectedHeroIds();
      const collectionSelected = collectionSelectedHeroIds();
      syncHeroCanvases(selected);
      selected.forEach((id) => {
        const hero = HERO_BY_ID.get(id);
        if (hero) void primeHeroImage(hero, true).catch(() => undefined);
      });
      collectionSelected.forEach((id) => {
        const hero = HERO_BY_ID.get(id);
        if (hero) startCollectionWarm(hero);
      });
      [...deckControllers.keys()].forEach((id) => {
        if (!collectionSelected.has(id)) stopDeckWarm(id);
      });
    };

    const scheduleSync = () => {
      if (syncFrame || disposed) return;
      syncFrame = window.requestAnimationFrame(sync);
    };

    const onChange = (event: Event) => {
      const select = event.target instanceof HTMLSelectElement ? event.target : null;
      if (select?.closest(".deck-picker")) {
        const hero = HERO_BY_ID.get(select.value);
        if (hero) void primeHeroImage(hero, true).catch(() => undefined);
      }
      scheduleSync();
    };
    const onPriorityInteraction = (event: Event) => promoteCardAtTarget(event.target);
    const onPointerDown = (event: Event) => {
      promoteCardAtTarget(event.target);
      scheduleSync();
    };

    const observer = new MutationObserver((records) => {
      const needsSync = records.some((record) => {
        if (record.type === "childList") return true;
        if (!(record.target instanceof HTMLCanvasElement)) return false;
        return record.target.dataset.artQuality !== "clean-hero";
      });
      if (needsSync) scheduleSync();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-page", "data-art-quality"],
    });

    document.addEventListener("change", onChange, true);
    document.addEventListener("pointerover", onPriorityInteraction, true);
    document.addEventListener("focusin", onPriorityInteraction, true);
    document.addEventListener("pointerdown", onPointerDown, true);

    // Issue local selected/visible work first, then warm the shared PDF catalogue.
    // This prevents a large catalogue request from being the first network task on
    // menu/setup screens where a lightweight hero portrait is the real priority.
    sync();
    catalogueTimer = window.setTimeout(() => {
      void preloadRemoteCardCatalog().catch(() => undefined);
    }, CATALOGUE_WARMUP_DELAY_MS);

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("pointerover", onPriorityInteraction, true);
      document.removeEventListener("focusin", onPriorityInteraction, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      if (catalogueTimer) window.clearTimeout(catalogueTimer);
      [...deckControllers.keys()].forEach(stopDeckWarm);
    };
  }, []);

  return null;
}

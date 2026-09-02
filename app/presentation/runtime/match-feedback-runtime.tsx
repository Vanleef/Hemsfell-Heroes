"use client";

import { useEffect } from "react";

const BOARD_SELECTOR = ".screen-game .game-stage > .game-content.hs-board";
const PANEL_SELECTOR = ":scope > .hero-panel-stack.canonical-hero-panel";
const EVOLUTION_BANNER_SELECTOR = "[data-hemsfell-evolution-available]";

const visibleRects = (board: HTMLElement, selector: string) => {
  const boardRect = board.getBoundingClientRect();
  return Array.from(board.querySelectorAll<HTMLElement>(selector))
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > boardRect.left && rect.left < boardRect.right);
};

const removeEvolutionBanner = () => {
  document.querySelector<HTMLElement>(EVOLUTION_BANNER_SELECTOR)?.remove();
};

const syncEvolutionAvailability = (board: HTMLElement) => {
  const panel = board.querySelector<HTMLElement>(".hero-panel-stack.canonical-hero-panel.player");
  const hero = panel?.querySelector<HTMLElement>(".player-hero:not(.enemy)") ?? null;
  const evolveButton = hero?.querySelector<HTMLButtonElement>(".level-button") ?? null;
  const available = !!panel && !!hero && hero.classList.contains("level-ready") && !!evolveButton && !evolveButton.disabled;

  panel?.classList.toggle("evolution-available", available);
  hero?.classList.toggle("evolution-available", available);

  let banner = document.querySelector<HTMLElement>(EVOLUTION_BANNER_SELECTOR);
  if (!available || !panel) {
    banner?.remove();
    return;
  }

  if (!banner) {
    banner = document.createElement("div");
    banner.className = "hero-evolution-available-banner";
    banner.dataset.hemsfellEvolutionAvailable = "true";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.textContent = "EVOLUÇÃO DISPONÍVEL";
    document.body.appendChild(banner);
  }

  const panelRect = panel.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = Math.max(7, Math.min(14, window.innerHeight * 0.012));
  const bannerRect = banner.getBoundingClientRect();
  const left = Math.max(
    viewportPadding,
    Math.min(panelRect.left + panelRect.width / 2 - bannerRect.width / 2, window.innerWidth - bannerRect.width - viewportPadding),
  );
  const top = Math.max(viewportPadding, panelRect.top - bannerRect.height - gap);
  banner.style.setProperty("left", `${Math.round(left)}px`, "important");
  banner.style.setProperty("top", `${Math.round(top)}px`, "important");
};

const positionDefenseDecision = (board: HTMLElement) => {
  const decision = board.querySelector<HTMLElement>(":scope > .defense-decision");
  if (!decision) return;

  const boardRect = board.getBoundingClientRect();
  /* The safe boundary is the first PLAYABLE board zone, not merely the first
   * creature. Cruel Terrain sits farther left than the creature row, so using
   * creatures alone let the prompt overlap the terrain/field lane (as seen in
   * the screenshot). Anchor against whichever visible zone begins first. */
  const playfieldRects = visibleRects(board, ".terrain-slot, .creature-slot, .auxiliary-slot");
  if (!playfieldRects.length) return;

  /* getBoundingClientRect() is rendered geometry, while inline px on the board
   * are pre-transform CSS pixels. Convert explicitly so a scaled responsive
   * board cannot make the decision panel wider or farther right than intended. */
  const scaleX = board.offsetWidth > 0 ? boardRect.width / board.offsetWidth : 1;
  const firstPlayfieldLeftViewport = Math.min(...playfieldRects.map((rect) => rect.left));
  const renderedGap = Math.max(12, Math.min(24, boardRect.width * 0.012));
  const viewportPadding = Math.max(10, Math.min(18, boardRect.width * 0.008));
  const railRightViewport = firstPlayfieldLeftViewport - renderedGap;
  const railLeftViewport = Math.max(viewportPadding, boardRect.left + viewportPadding);
  const availableRenderedWidth = Math.max(0, railRightViewport - railLeftViewport);
  const desiredRenderedWidth = Math.max(176, Math.min(224, boardRect.width * 0.175));
  const renderedWidth = Math.max(0, Math.min(desiredRenderedWidth, availableRenderedWidth));
  const leftViewport = Math.max(railLeftViewport, railRightViewport - renderedWidth);

  const localLeft = (leftViewport - boardRect.left) / scaleX;
  const localWidth = renderedWidth / scaleX;

  decision.style.setProperty("position", "absolute", "important");
  decision.style.setProperty("right", "auto", "important");
  decision.style.setProperty("bottom", "auto", "important");
  decision.style.setProperty("inset-inline", "auto", "important");
  decision.style.setProperty("margin", "0", "important");
  decision.style.setProperty("top", "50%", "important");
  decision.style.setProperty("transform", "translateY(-50%)", "important");
  decision.style.setProperty("left", `${Math.round(localLeft * 1000) / 1000}px`, "important");
  decision.style.setProperty("width", `${Math.round(localWidth * 1000) / 1000}px`, "important");
  decision.style.setProperty("min-width", "0", "important");
  decision.style.setProperty("max-width", `${Math.round(localWidth * 1000) / 1000}px`, "important");
  decision.style.setProperty("inline-size", `${Math.round(localWidth * 1000) / 1000}px`, "important");
  decision.style.setProperty("min-inline-size", "0", "important");
  decision.style.setProperty("max-inline-size", `${Math.round(localWidth * 1000) / 1000}px`, "important");
  decision.dataset.geometryAnchored = "left-of-first-playable-zone";
};

export default function MatchFeedbackRuntime() {
  useEffect(() => {
    let frame = 0;
    const knownLevels = new Map<"player" | "enemy", string>();
    const flashTimers = new Map<HTMLElement, number>();

    const scanLevelChanges = (board: HTMLElement) => {
      board.querySelectorAll<HTMLElement>(PANEL_SELECTOR).forEach((panel) => {
        const key: "player" | "enemy" = panel.classList.contains("player") ? "player" : "enemy";
        const levelText = panel.querySelector<HTMLElement>(".hero-level")?.textContent || "";
        const level = levelText.match(/\d+/)?.[0];
        if (!level) return;

        const previous = knownLevels.get(key);
        knownLevels.set(key, level);
        if (!previous || previous === level) return;

        const existingTimer = flashTimers.get(panel);
        if (existingTimer) window.clearTimeout(existingTimer);
        panel.classList.remove("hero-level-transition");
        void panel.offsetWidth;
        panel.classList.add("hero-level-transition");
        const timer = window.setTimeout(() => {
          panel.classList.remove("hero-level-transition");
          flashTimers.delete(panel);
        }, 190);
        flashTimers.set(panel, timer);
      });
    };

    const scan = () => {
      frame = 0;
      const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
      if (!board) {
        removeEvolutionBanner();
        return;
      }
      syncEvolutionAvailability(board);
      positionDefenseDecision(board);
      scanLevelChanges(board);
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "disabled"],
    });

    const resizeObserver = new ResizeObserver(schedule);
    const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
    if (board) resizeObserver.observe(board);

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      flashTimers.forEach((timer) => window.clearTimeout(timer));
      flashTimers.clear();
      removeEvolutionBanner();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

const BOARD_SELECTOR = ".screen-game .game-stage > .game-content.hs-board";
const PANEL_SELECTOR = ":scope > .hero-panel-stack.canonical-hero-panel";
const LEGACY_EVOLUTION_BANNER_SELECTOR = "[data-hemsfell-evolution-available]";
const PRIORITY_BAND_X = "--hh-priority-band-x";
const PRIORITY_BAND_Y = "--hh-priority-band-y";

const visibleRects = (board: HTMLElement, selector: string) => {
  const boardRect = board.getBoundingClientRect();
  return Array.from(board.querySelectorAll<HTMLElement>(selector))
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > boardRect.left && rect.left < boardRect.right);
};

const removeLegacyEvolutionBanner = () => {
  document.querySelector<HTMLElement>(LEGACY_EVOLUTION_BANNER_SELECTOR)?.remove();
};

const clearPriorityBand = () => {
  document.documentElement.style.removeProperty(PRIORITY_BAND_X);
  document.documentElement.style.removeProperty(PRIORITY_BAND_Y);
};

const syncEvolutionAvailability = (board: HTMLElement) => {
  const panel = board.querySelector<HTMLElement>(":scope > .hero-panel-stack.canonical-hero-panel.player");
  const hero = panel?.querySelector<HTMLElement>(":scope > .player-hero:not(.enemy)") ?? null;
  const evolveButton = hero?.querySelector<HTMLButtonElement>(":scope > .level-button") ?? null;
  const ready = !!panel && !!hero && hero.classList.contains("level-ready") && !!evolveButton;
  const available = ready && !evolveButton.disabled;

  panel?.classList.toggle("evolution-ready", ready);
  panel?.classList.toggle("evolution-available", available);
  hero?.classList.toggle("evolution-ready", ready);
  hero?.classList.toggle("evolution-available", available);

  if (panel) {
    if (available) panel.dataset.evolutionAvailable = "true";
    else delete panel.dataset.evolutionAvailable;
  }

  removeLegacyEvolutionBanner();
};

const syncPriorityBand = (board: HTMLElement) => {
  const enemyField = board.querySelector<HTMLElement>(":scope > .paired-field.enemy-field");
  const playerField = board.querySelector<HTMLElement>(":scope > .paired-field.player-field");
  if (!enemyField || !playerField) {
    clearPriorityBand();
    return;
  }

  const enemyRect = enemyField.getBoundingClientRect();
  const playerRect = playerField.getBoundingClientRect();
  if (!enemyRect.width || !enemyRect.height || !playerRect.width || !playerRect.height) {
    clearPriorityBand();
    return;
  }

  const sharedLeft = Math.max(enemyRect.left, playerRect.left);
  const sharedRight = Math.min(enemyRect.right, playerRect.right);
  const centerX = sharedRight > sharedLeft
    ? sharedLeft + (sharedRight - sharedLeft) / 2
    : (enemyRect.left + enemyRect.right + playerRect.left + playerRect.right) / 4;

  const enemyAbove = enemyRect.top <= playerRect.top;
  const upperRect = enemyAbove ? enemyRect : playerRect;
  const lowerRect = enemyAbove ? playerRect : enemyRect;
  const centerY = upperRect.bottom <= lowerRect.top
    ? upperRect.bottom + (lowerRect.top - upperRect.bottom) / 2
    : (upperRect.bottom + lowerRect.top) / 2;

  document.documentElement.style.setProperty(PRIORITY_BAND_X, `${Math.round(centerX * 1000) / 1000}px`);
  document.documentElement.style.setProperty(PRIORITY_BAND_Y, `${Math.round(centerY * 1000) / 1000}px`);
};

const positionDefenseDecision = (board: HTMLElement) => {
  const decision = board.querySelector<HTMLElement>(":scope > .defense-decision");
  if (!decision) return;

  const boardRect = board.getBoundingClientRect();
  const enemyPanel = board.querySelector<HTMLElement>(":scope > .hero-panel-stack.canonical-hero-panel.enemy");
  const playerPanel = board.querySelector<HTMLElement>(":scope > .hero-panel-stack.canonical-hero-panel.player");
  const enemyRect = enemyPanel?.getBoundingClientRect() ?? null;
  const playerRect = playerPanel?.getBoundingClientRect() ?? null;
  const terrainRects = visibleRects(board, ":scope > .terrain-slot");
  const fieldRects = visibleRects(board, ".paired-field .field-slot");

  if (!enemyRect || !playerRect || !fieldRects.length) return;

  const scaleX = board.offsetWidth > 0 ? boardRect.width / board.offsetWidth : 1;
  const scaleY = board.offsetHeight > 0 ? boardRect.height / board.offsetHeight : 1;
  const viewportPadding = Math.max(7, Math.min(14, boardRect.width * 0.0065));
  const firstFieldLeftViewport = Math.min(...fieldRects.map((rect) => rect.left));

  /* Use the real terrain -> first field distance as the spacing reference, but
   * keep the blocking decision noticeably closer to the terrain than that full
   * gap. This leaves a deliberate breathing strip without pushing the prompt
   * back into the hero rail. */
  const terrainBeforeField = terrainRects.filter((rect) => rect.right <= firstFieldLeftViewport + 2);
  const referenceTerrain = terrainBeforeField.length
    ? terrainBeforeField.reduce((best, rect) => rect.right > best.right ? rect : best)
    : null;
  const terrainFieldGap = referenceTerrain
    ? Math.max(8, Math.min(28, firstFieldLeftViewport - referenceTerrain.right))
    : Math.max(10, Math.min(22, boardRect.width * 0.011));
  const decisionTerrainGap = Math.max(6, Math.min(14, terrainFieldGap * 0.5));
  const decisionRightViewport = referenceTerrain
    ? referenceTerrain.left - decisionTerrainGap
    : firstFieldLeftViewport - terrainFieldGap - decisionTerrainGap;

  const desiredRenderedWidth = Math.max(enemyRect.width, playerRect.width);
  const leftLimitViewport = boardRect.left + viewportPadding;
  const availableRenderedWidth = Math.max(0, decisionRightViewport - leftLimitViewport);
  const renderedWidth = Math.max(0, Math.min(desiredRenderedWidth, availableRenderedWidth));
  if (renderedWidth <= 0) return;

  const decisionLeftViewport = Math.max(leftLimitViewport, decisionRightViewport - renderedWidth);
  const localLeft = (decisionLeftViewport - boardRect.left) / scaleX;
  const localWidth = renderedWidth / scaleX;

  decision.style.setProperty("position", "absolute", "important");
  decision.style.setProperty("inset", "auto", "important");
  decision.style.setProperty("right", "auto", "important");
  decision.style.setProperty("bottom", "auto", "important");
  decision.style.setProperty("margin", "0", "important");
  decision.style.setProperty("transform", "none", "important");
  decision.style.setProperty("left", `${Math.round(localLeft * 1000) / 1000}px`, "important");
  decision.style.setProperty("width", `${Math.round(localWidth * 1000) / 1000}px`, "important");
  decision.style.setProperty("min-width", "0", "important");
  decision.style.setProperty("max-width", `${Math.round(localWidth * 1000) / 1000}px`, "important");
  decision.style.setProperty("inline-size", `${Math.round(localWidth * 1000) / 1000}px`, "important");
  decision.style.setProperty("min-inline-size", "0", "important");
  decision.style.setProperty("max-inline-size", `${Math.round(localWidth * 1000) / 1000}px`, "important");

  const renderedDecisionHeight = decision.getBoundingClientRect().height;
  const verticalGapPadding = Math.max(6, Math.min(12, boardRect.height * 0.011));
  const gapTopViewport = enemyRect.bottom + verticalGapPadding;
  const gapBottomViewport = playerRect.top - verticalGapPadding;
  const gapHeight = Math.max(0, gapBottomViewport - gapTopViewport);
  const centeredTopViewport = gapTopViewport + Math.max(0, (gapHeight - renderedDecisionHeight) / 2);
  const minTopViewport = boardRect.top + viewportPadding;
  const maxTopViewport = Math.max(minTopViewport, boardRect.bottom - renderedDecisionHeight - viewportPadding);
  const clampedTopViewport = Math.min(Math.max(minTopViewport, centeredTopViewport), maxTopViewport);
  const localTop = (clampedTopViewport - boardRect.top) / scaleY;

  decision.style.setProperty("top", `${Math.round(localTop * 1000) / 1000}px`, "important");
  decision.dataset.geometryAnchored = "left-of-terrain-reference-gap";
};

export default function MatchFeedbackRuntime() {
  useEffect(() => {
    let frame = 0;
    const knownLevels = new Map<"player" | "enemy", string>();
    const flashTimers = new Map<HTMLElement, number>();
    let resizeObserver: ResizeObserver | null = null;

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
        requestAnimationFrame(() => {
          if (panel.isConnected) panel.classList.add("hero-level-transition");
        });
        const timer = window.setTimeout(() => {
          panel.classList.remove("hero-level-transition");
          flashTimers.delete(panel);
        }, 190);
        flashTimers.set(panel, timer);
      });
    };

    const observeGeometry = (board: HTMLElement) => {
      if (!resizeObserver) return;
      resizeObserver.observe(board);
      const selectors = [
        ":scope > .hero-panel-stack.canonical-hero-panel.enemy",
        ":scope > .hero-panel-stack.canonical-hero-panel.player",
        ":scope > .defense-decision",
        ":scope > .paired-field.enemy-field",
        ":scope > .paired-field.player-field",
        ":scope > .terrain-slot.enemy-terrain",
        ":scope > .terrain-slot.player-terrain",
      ];
      for (const selector of selectors) {
        const node = board.querySelector<HTMLElement>(selector);
        if (node) resizeObserver.observe(node);
      }
    };

    const scan = () => {
      frame = 0;
      const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
      if (!board) {
        removeLegacyEvolutionBanner();
        clearPriorityBand();
        return;
      }
      observeGeometry(board);
      syncEvolutionAvailability(board);
      syncPriorityBand(board);
      positionDefenseDecision(board);
      scanLevelChanges(board);
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    };

    const mutationTouchesFeedback = (record: MutationRecord) => {
      const selector = ".hero-panel-stack,.player-hero,.level-button,.hero-level,.defense-decision,.paired-field,.terrain-slot";
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest(selector)) return true;
      if (record.type !== "childList") return false;
      return [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (node.matches(selector) || !!node.querySelector(selector)));
    };
    const observer = new MutationObserver((records) => {
      if (records.some(mutationTouchesFeedback)) schedule();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "disabled"],
    });

    resizeObserver = new ResizeObserver(schedule);

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver?.disconnect();
      flashTimers.forEach((timer) => window.clearTimeout(timer));
      flashTimers.clear();
      removeLegacyEvolutionBanner();
      clearPriorityBand();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  return null;
}

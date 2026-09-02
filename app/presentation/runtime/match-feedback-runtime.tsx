"use client";

import { useEffect } from "react";

const BOARD_SELECTOR = ".screen-game .game-stage > .game-content.hs-board";
const PANEL_SELECTOR = ":scope > .hero-panel-stack.canonical-hero-panel";
const LEGACY_EVOLUTION_BANNER_SELECTOR = "[data-hemsfell-evolution-available]";

const visibleRects = (board: HTMLElement, selector: string) => {
  const boardRect = board.getBoundingClientRect();
  return Array.from(board.querySelectorAll<HTMLElement>(selector))
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > boardRect.left && rect.left < boardRect.right);
};

const removeLegacyEvolutionBanner = () => {
  document.querySelector<HTMLElement>(LEGACY_EVOLUTION_BANNER_SELECTOR)?.remove();
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

  /* Older builds created a fixed banner under body. The canonical feedback now
   * belongs to the hero panel itself, so remove an HMR/stale-runtime leftover. */
  removeLegacyEvolutionBanner();
};

const positionDefenseDecision = (board: HTMLElement) => {
  const decision = board.querySelector<HTMLElement>(":scope > .defense-decision");
  if (!decision) return;

  const boardRect = board.getBoundingClientRect();
  const enemyPanel = board.querySelector<HTMLElement>(":scope > .hero-panel-stack.canonical-hero-panel.enemy");
  const playerPanel = board.querySelector<HTMLElement>(":scope > .hero-panel-stack.canonical-hero-panel.player");
  const enemyRect = enemyPanel?.getBoundingClientRect() ?? null;
  const playerRect = playerPanel?.getBoundingClientRect() ?? null;
  const playfieldRects = visibleRects(board, ".terrain-slot, .creature-slot, .auxiliary-slot");

  if (!enemyRect || !playerRect || !playfieldRects.length) return;

  /* The defender decision owns the SAME left HUD lane as the hero panels. It is
   * centered only in the vertical gap between them and can never extend into
   * the first terrain/field slot. */
  const scaleX = board.offsetWidth > 0 ? boardRect.width / board.offsetWidth : 1;
  const scaleY = board.offsetHeight > 0 ? boardRect.height / board.offsetHeight : 1;
  const firstPlayfieldLeftViewport = Math.min(...playfieldRects.map((rect) => rect.left));
  const fieldGap = Math.max(10, Math.min(22, boardRect.width * 0.011));
  const viewportPadding = Math.max(7, Math.min(14, boardRect.width * 0.0065));

  const heroLaneLeftViewport = Math.max(
    boardRect.left + viewportPadding,
    Math.min(enemyRect.left, playerRect.left),
  );
  const heroLaneNaturalRightViewport = Math.max(enemyRect.right, playerRect.right);
  const heroLaneRightViewport = Math.min(heroLaneNaturalRightViewport, firstPlayfieldLeftViewport - fieldGap);
  const renderedWidth = Math.max(0, heroLaneRightViewport - heroLaneLeftViewport);

  if (renderedWidth <= 0) return;

  const localLeft = (heroLaneLeftViewport - boardRect.left) / scaleX;
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

  /* Width changes wrapping, so measure the final decision after lane width is
   * applied and only then center it between the two hero cards. */
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
  decision.dataset.geometryAnchored = "hero-lane-between-panels";
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
        void panel.offsetWidth;
        panel.classList.add("hero-level-transition");
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
      const enemyPanel = board.querySelector<HTMLElement>(":scope > .hero-panel-stack.canonical-hero-panel.enemy");
      const playerPanel = board.querySelector<HTMLElement>(":scope > .hero-panel-stack.canonical-hero-panel.player");
      const defenseDecision = board.querySelector<HTMLElement>(":scope > .defense-decision");
      if (enemyPanel) resizeObserver.observe(enemyPanel);
      if (playerPanel) resizeObserver.observe(playerPanel);
      if (defenseDecision) resizeObserver.observe(defenseDecision);
    };

    const scan = () => {
      frame = 0;
      const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
      if (!board) {
        removeLegacyEvolutionBanner();
        return;
      }
      observeGeometry(board);
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
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  return null;
}

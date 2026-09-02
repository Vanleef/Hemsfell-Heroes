"use client";

import { useEffect } from "react";

const BOARD_SELECTOR = ".screen-game .game-stage > .game-content.hs-board";
const PANEL_SELECTOR = ":scope > .hero-panel-stack.canonical-hero-panel";

const visibleRects = (board: HTMLElement, selector: string) => {
  const boardRect = board.getBoundingClientRect();
  return Array.from(board.querySelectorAll<HTMLElement>(selector))
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > boardRect.left && rect.left < boardRect.right);
};

const syncEvolutionAvailability = (board: HTMLElement) => {
  const panel = board.querySelector<HTMLElement>(`${PANEL_SELECTOR}.player`);
  if (!panel) return;

  const available = !!panel.querySelector<HTMLElement>(
    ":scope > .player-hero.level-ready > .level-button:not(:disabled)",
  );
  panel.classList.toggle("evolution-available", available);

  let banner = panel.querySelector<HTMLElement>(":scope > .hero-evolution-available-banner");
  if (available && !banner) {
    banner = document.createElement("div");
    banner.className = "hero-evolution-available-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.textContent = "EVOLUÇÃO DISPONÍVEL";
    panel.appendChild(banner);
  } else if (!available && banner) {
    banner.remove();
  }
};

const positionDefenseDecision = (board: HTMLElement) => {
  const decision = board.querySelector<HTMLElement>(":scope > .defense-decision");
  if (!decision) return;

  const boardRect = board.getBoundingClientRect();
  const creatureRects = visibleRects(board, ".creature-slot");
  if (!creatureRects.length) return;

  const firstCreatureLeft = Math.min(...creatureRects.map((rect) => rect.left));
  const gap = Math.max(10, Math.min(24, boardRect.width * 0.014));
  const edgePadding = Math.max(7, boardRect.width * 0.008);

  decision.style.setProperty("position", "absolute", "important");
  decision.style.setProperty("right", "auto", "important");
  decision.style.setProperty("bottom", "auto", "important");
  decision.style.setProperty("inset-inline", "auto", "important");
  decision.style.setProperty("margin", "0", "important");
  decision.style.setProperty("top", "50%", "important");
  decision.style.setProperty("transform", "translateY(-50%)", "important");

  const width = decision.getBoundingClientRect().width;
  const desiredLeftViewport = firstCreatureLeft - gap - width;
  const leftViewport = Math.max(boardRect.left + edgePadding, desiredLeftViewport);
  decision.style.setProperty("left", `${Math.round((leftViewport - boardRect.left) * 1000) / 1000}px`, "important");
  decision.dataset.geometryAnchored = "left-of-fields";
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
        }, 320);
        flashTimers.set(panel, timer);
      });
    };

    const scan = () => {
      frame = 0;
      const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
      if (!board) return;
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
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      flashTimers.forEach((timer) => window.clearTimeout(timer));
      flashTimers.clear();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, []);

  return null;
}

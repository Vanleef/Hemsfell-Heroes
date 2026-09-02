"use client";

import { useEffect } from "react";

const BOARD_SELECTOR = ".screen-game .game-stage > .game-content.hs-board";

type TerrainPair = {
  field: ".enemy-field" | ".player-field";
  terrain: ".enemy-terrain" | ".player-terrain";
};

const PAIRS: TerrainPair[] = [
  { field: ".enemy-field", terrain: ".enemy-terrain" },
  { field: ".player-field", terrain: ".player-terrain" },
];

/**
 * Keeps Cruel Terrain attached to the actual rendered owner field instead of
 * approximating its location from board grid tracks. This is presentation-only:
 * the terrain remains the same DOM/game object and keeps all existing handlers.
 */
export default function TerrainFieldAnchorRuntime() {
  useEffect(() => {
    let frame = 0;
    let observedBoard: HTMLElement | null = null;
    const resizeObserver = new ResizeObserver(() => schedule());

    const measureSlotGap = (field: HTMLElement) => {
      const first = field.querySelector<HTMLElement>('.field-slot[data-slot="1"]');
      const second = field.querySelector<HTMLElement>('.field-slot[data-slot="2"]');
      if (!first || !second) return 6;
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      return Math.max(2, b.left - a.right);
    };

    const bindObservers = (board: HTMLElement) => {
      if (observedBoard === board) return;
      resizeObserver.disconnect();
      observedBoard = board;
      resizeObserver.observe(board);
      PAIRS.forEach(({ field }) => {
        const el = board.querySelector<HTMLElement>(`:scope > ${field}`);
        if (el) resizeObserver.observe(el);
      });
    };

    const position = () => {
      const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
      if (!board) return;
      bindObservers(board);

      const boardRect = board.getBoundingClientRect();
      PAIRS.forEach(({ field, terrain }) => {
        const fieldEl = board.querySelector<HTMLElement>(`:scope > ${field}`);
        const terrainEl = board.querySelector<HTMLElement>(`:scope > ${terrain}`);
        if (!fieldEl || !terrainEl) return;

        const fieldRect = fieldEl.getBoundingClientRect();
        const terrainRect = terrainEl.getBoundingClientRect();
        const gap = measureSlotGap(fieldEl);
        const x = fieldRect.left - boardRect.left - terrainRect.width - gap;
        const y = fieldRect.top - boardRect.top + (fieldRect.height - terrainRect.height) / 2;

        terrainEl.style.setProperty("--terrain-anchor-x", `${Math.max(0, x)}px`);
        terrainEl.style.setProperty("--terrain-anchor-y", `${Math.max(0, y)}px`);
        terrainEl.classList.add("is-field-anchored");
      });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

const BOARD_SELECTOR = ".screen-game .game-stage > .game-content.hs-board";
const TERRAIN_GAP_MULTIPLIER = 2.05;
const TERRAIN_MIN_SLOT_CLEARANCE = 0.34;

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
 * approximating its location from board grid tracks. Geometry is measured from
 * the first real slot and converted back from viewport coordinates into the
 * board's local CSS coordinate space, which keeps the anchor correct when the
 * whole match stage is responsively scaled. This is presentation-only: the
 * terrain remains the same DOM/game object and keeps all existing handlers.
 */
export default function TerrainFieldAnchorRuntime() {
  useEffect(() => {
    let frame = 0;
    let observedBoard: HTMLElement | null = null;
    const resizeObserver = new ResizeObserver(() => schedule());

    const getFieldGeometry = (field: HTMLElement) => {
      const first = field.querySelector<HTMLElement>('.field-slot[data-slot="1"]');
      const second = field.querySelector<HTMLElement>('.field-slot[data-slot="2"]');
      if (!first) return null;

      const firstRect = first.getBoundingClientRect();
      const secondRect = second?.getBoundingClientRect();
      const measuredGap = secondRect ? Math.max(2, secondRect.left - firstRect.right) : 6;
      const minimumSlotClearance = firstRect.width * TERRAIN_MIN_SLOT_CLEARANCE;

      return {
        firstRect,
        clearance: Math.max(measuredGap * TERRAIN_GAP_MULTIPLIER, minimumSlotClearance, 10),
      };
    };

    const getBoardScale = (board: HTMLElement, boardRect: DOMRect) => {
      const layoutWidth = board.offsetWidth || board.clientWidth || boardRect.width || 1;
      const layoutHeight = board.offsetHeight || board.clientHeight || boardRect.height || 1;
      const rawScaleX = boardRect.width / layoutWidth;
      const rawScaleY = boardRect.height / layoutHeight;
      return {
        x: Number.isFinite(rawScaleX) && rawScaleX > 0 ? rawScaleX : 1,
        y: Number.isFinite(rawScaleY) && rawScaleY > 0 ? rawScaleY : 1,
      };
    };

    const bindObservers = (board: HTMLElement) => {
      if (observedBoard === board) return;
      resizeObserver.disconnect();
      observedBoard = board;
      resizeObserver.observe(board);
      PAIRS.forEach(({ field, terrain }) => {
        const fieldEl = board.querySelector<HTMLElement>(`:scope > ${field}`);
        const terrainEl = board.querySelector<HTMLElement>(`:scope > ${terrain}`);
        if (fieldEl) resizeObserver.observe(fieldEl);
        if (terrainEl) resizeObserver.observe(terrainEl);
      });
    };

    const position = () => {
      const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
      if (!board) return;
      bindObservers(board);

      const boardRect = board.getBoundingClientRect();
      const boardScale = getBoardScale(board, boardRect);

      PAIRS.forEach(({ field, terrain }) => {
        const fieldEl = board.querySelector<HTMLElement>(`:scope > ${field}`);
        const terrainEl = board.querySelector<HTMLElement>(`:scope > ${terrain}`);
        if (!fieldEl || !terrainEl) return;

        const geometry = getFieldGeometry(fieldEl);
        if (!geometry) return;

        const fieldRect = fieldEl.getBoundingClientRect();
        const terrainRect = terrainEl.getBoundingClientRect();
        const terrainWidth = terrainRect.width / boardScale.x;
        const terrainHeight = terrainRect.height / boardScale.y;
        const firstSlotLeft = (geometry.firstRect.left - boardRect.left) / boardScale.x;
        const clearance = geometry.clearance / boardScale.x;
        const fieldTop = (fieldRect.top - boardRect.top) / boardScale.y;
        const fieldHeight = fieldRect.height / boardScale.y;

        const x = firstSlotLeft - terrainWidth - clearance;
        const y = fieldTop + (fieldHeight - terrainHeight) / 2;

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

"use client";

import { useEffect } from "react";

const BOARD_SELECTOR = ".screen-game .game-stage > .game-content.hs-board";
const PAIRS = [
  { field: ".enemy-field", terrain: ".enemy-terrain" },
  { field: ".player-field", terrain: ".player-terrain" },
] as const;

export default function TerrainProximityRuntime() {
  useEffect(() => {
    let frame = 0;
    let settleFrame = 0;
    const resizeObserver = new ResizeObserver(() => schedule());

    const sync = () => {
      const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
      if (!board) return;
      const boardRect = board.getBoundingClientRect();
      const layoutWidth = board.offsetWidth || board.clientWidth || boardRect.width || 1;
      const scaleX = Math.max(boardRect.width / layoutWidth, 0.0001);

      PAIRS.forEach(({ field, terrain }) => {
        const fieldEl = board.querySelector<HTMLElement>(`:scope > ${field}`);
        const terrainEl = board.querySelector<HTMLElement>(`:scope > ${terrain}`);
        const first = fieldEl?.querySelector<HTMLElement>('.field-slot[data-slot="1"]');
        const second = fieldEl?.querySelector<HTMLElement>('.field-slot[data-slot="2"]');
        if (!fieldEl || !terrainEl || !first) return;

        const firstRect = first.getBoundingClientRect();
        const secondRect = second?.getBoundingClientRect();
        const measuredGap = secondRect
          ? Math.max(2, secondRect.left - firstRect.right)
          : Math.max(2, firstRect.width * 0.08);
        const renderedClearance = Math.max(measuredGap * 0.72, firstRect.width * 0.11, 3);
        const slotWidth = firstRect.width / scaleX;
        const firstSlotLeft = (firstRect.left - boardRect.left) / scaleX;
        const clearance = renderedClearance / scaleX;
        const x = Math.max(0, firstSlotLeft - slotWidth - clearance);

        terrainEl.style.setProperty("left", `${x}px`, "important");
        terrainEl.style.setProperty("--terrain-anchor-x", `${x}px`);

        if (terrain === ".player-terrain") {
          const sentinel = board.querySelector<HTMLElement>(":scope > .terrain-drag-sentinel");
          if (sentinel) sentinel.style.left = `${x}px`;
        }
      });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settleFrame);
      frame = requestAnimationFrame(() => {
        settleFrame = requestAnimationFrame(sync);
      });
    };

    const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
    if (board) {
      resizeObserver.observe(board);
      PAIRS.forEach(({ field }) => {
        const fieldEl = board.querySelector<HTMLElement>(`:scope > ${field}`);
        if (fieldEl) resizeObserver.observe(fieldEl);
      });
    }

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    document.addEventListener("dragstart", schedule, true);
    document.addEventListener("dragend", schedule, true);
    document.addEventListener("drop", schedule, true);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settleFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      document.removeEventListener("dragstart", schedule, true);
      document.removeEventListener("dragend", schedule, true);
      document.removeEventListener("drop", schedule, true);
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

const BOARD_SELECTOR = ".screen-game .game-stage > .game-content.hs-board";
// Preserve the approved pre-regression field spacing while drag stability is handled independently.
const TERRAIN_GAP_MULTIPLIER = 1.85;
const TERRAIN_MIN_SLOT_CLEARANCE = 0.28;
// A small responsive proximity correction keeps the terrain associated with its owner field
// without reintroducing the overlap that existed before the measured anchor runtime.
const TERRAIN_GAP_PROXIMITY = 0.94;

type TerrainPair = {
  field: ".enemy-field" | ".player-field";
  terrain: ".enemy-terrain" | ".player-terrain";
};

const PAIRS: TerrainPair[] = [
  { field: ".enemy-field", terrain: ".enemy-terrain" },
  { field: ".player-field", terrain: ".player-terrain" },
];

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
      const rawMeasuredGap = secondRect ? Math.max(2, secondRect.left - firstRect.right) : 6;
      const measuredGap = rawMeasuredGap * TERRAIN_GAP_PROXIMITY;
      const minimumSlotClearance = firstRect.width * TERRAIN_MIN_SLOT_CLEARANCE;
      return {
        firstRect,
        clearance: Math.max(measuredGap * TERRAIN_GAP_MULTIPLIER, minimumSlotClearance, 8),
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

    const syncEnergyDisplay = () => {
      document.querySelectorAll<HTMLElement>(".screen-game .field-energy").forEach((panel) => {
        const match = panel.getAttribute("aria-label")?.match(/(\d+)\s+de\s+(\d+)\s+energias;\s*(\d+)\s+de\s+3\s+reservas/i);
        if (!match) return;
        const energy = Number(match[1] || 0);
        const reserve = Number(match[3] || 0);
        const dial = panel.querySelector<HTMLElement>(".energy-dial");
        const current = dial?.querySelector<HTMLElement>("strong > em");
        if (!dial || !current) return;
        const displayed = String(reserve > 0 ? energy + reserve : energy);
        if (current.textContent !== displayed) current.textContent = displayed;
        dial.classList.toggle("uses-reserve-total", reserve > 0);
      });
    };

    const ensureDragSentinel = (board: HTMLElement) => {
      let sentinel = board.querySelector<HTMLElement>(":scope > .terrain-drag-sentinel");
      if (!sentinel) {
        sentinel = document.createElement("div");
        sentinel.className = "terrain-drag-sentinel";
        sentinel.setAttribute("aria-hidden", "true");
        sentinel.innerHTML = '<span class="terrain-drag-sentinel-icon">▲</span>';
        board.append(sentinel);
      }
      return sentinel;
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

    const pinTerrainGeometry = (
      terrainEl: HTMLElement,
      x: number,
      y: number,
      slotWidth: number,
      slotHeight: number,
    ) => {
      const px = (value: number) => `${Math.max(0, value)}px`;
      terrainEl.style.setProperty("--terrain-anchor-x", px(x));
      terrainEl.style.setProperty("--terrain-anchor-y", px(y));
      terrainEl.style.setProperty("--terrain-anchor-width", `${slotWidth}px`);
      terrainEl.style.setProperty("--terrain-anchor-height", `${slotHeight}px`);

      terrainEl.style.setProperty("position", "absolute", "important");
      terrainEl.style.setProperty("left", px(x), "important");
      terrainEl.style.setProperty("top", px(y), "important");
      terrainEl.style.setProperty("right", "auto", "important");
      terrainEl.style.setProperty("bottom", "auto", "important");
      terrainEl.style.setProperty("width", `${slotWidth}px`, "important");
      terrainEl.style.setProperty("min-width", `${slotWidth}px`, "important");
      terrainEl.style.setProperty("max-width", `${slotWidth}px`, "important");
      terrainEl.style.setProperty("height", `${slotHeight}px`, "important");
      terrainEl.style.setProperty("min-height", `${slotHeight}px`, "important");
      terrainEl.style.setProperty("max-height", `${slotHeight}px`, "important");
      terrainEl.style.setProperty("margin", "0", "important");
      terrainEl.style.setProperty("translate", "0 0", "important");
      terrainEl.style.setProperty("transform", "none", "important");
      terrainEl.style.setProperty("animation", "none", "important");
      terrainEl.style.setProperty("visibility", "visible", "important");
      terrainEl.style.setProperty("opacity", "1", "important");
      terrainEl.style.setProperty("display", "grid", "important");
      terrainEl.style.setProperty("place-items", "center", "important");
      terrainEl.style.setProperty("box-sizing", "border-box", "important");
      terrainEl.style.setProperty("z-index", "48", "important");
      terrainEl.classList.add("is-field-anchored");
    };

    const syncPlayerDragSentinel = (
      board: HTMLElement,
      terrainEl: HTMLElement,
      x: number,
      y: number,
      slotWidth: number,
      slotHeight: number,
    ) => {
      const sentinel = ensureDragSentinel(board);
      const active = terrainEl.classList.contains("can-drop");
      const occupied = !!terrainEl.querySelector(".card-frame");
      sentinel.dataset.active = active ? "true" : "false";
      sentinel.dataset.occupied = occupied ? "true" : "false";
      sentinel.style.left = `${Math.max(0, x)}px`;
      sentinel.style.top = `${Math.max(0, y)}px`;
      sentinel.style.width = `${slotWidth}px`;
      sentinel.style.height = `${slotHeight}px`;
    };

    const position = () => {
      const board = document.querySelector<HTMLElement>(BOARD_SELECTOR);
      syncEnergyDisplay();
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

        const slotWidth = geometry.firstRect.width / boardScale.x;
        const slotHeight = geometry.firstRect.height / boardScale.y;
        const fieldRect = fieldEl.getBoundingClientRect();
        const firstSlotLeft = (geometry.firstRect.left - boardRect.left) / boardScale.x;
        const clearance = geometry.clearance / boardScale.x;
        const fieldTop = (fieldRect.top - boardRect.top) / boardScale.y;
        const fieldHeight = fieldRect.height / boardScale.y;
        const x = firstSlotLeft - slotWidth - clearance;
        const y = fieldTop + (fieldHeight - slotHeight) / 2;

        pinTerrainGeometry(terrainEl, x, y, slotWidth, slotHeight);
        if (terrain === ".player-terrain") {
          syncPlayerDragSentinel(board, terrainEl, x, y, slotWidth, slotHeight);
        }
      });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    document.addEventListener("dragstart", schedule, true);
    document.addEventListener("dragend", schedule, true);
    document.addEventListener("drop", schedule, true);
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      document.removeEventListener("dragstart", schedule, true);
      document.removeEventListener("dragend", schedule, true);
      document.removeEventListener("drop", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      document.querySelector(".terrain-drag-sentinel")?.remove();
    };
  }, []);
  return null;
}

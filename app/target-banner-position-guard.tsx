"use client";

import { useEffect } from "react";

const px = (value: number) => `${Math.round(value * 1000) / 1000}px`;

function positionTargetBanner() {
  const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
  const banner = board?.querySelector<HTMLElement>(":scope > .target-banner");
  if (!board || !banner) return;

  const boardRect = board.getBoundingClientRect();
  const creatureSlots = Array.from(board.querySelectorAll<HTMLElement>(".creature-slot"))
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > boardRect.left && rect.left < boardRect.right);
  const terrainSlots = Array.from(board.querySelectorAll<HTMLElement>(".terrain-slot"))
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.bottom > boardRect.top && rect.top < boardRect.bottom)
    .sort((a, b) => a.top - b.top);

  if (!creatureSlots.length) return;

  // Reference position: the banner ends just before the first creature column.
  const firstCreatureLeft = Math.min(...creatureSlots.map((rect) => rect.left));
  const gap = Math.max(8, Math.min(28, boardRect.width * 0.018));
  const bannerRight = firstCreatureLeft - gap;

  // Keep intrinsic/content-sized geometry before measuring its final width.
  banner.style.setProperty("position", "absolute", "important");
  banner.style.setProperty("width", "max-content", "important");
  banner.style.setProperty("min-width", "0", "important");
  banner.style.setProperty("max-width", `${Math.max(140, boardRect.width * 0.28)}px`, "important");
  banner.style.setProperty("right", "auto", "important");
  banner.style.setProperty("bottom", "auto", "important");
  banner.style.setProperty("margin", "0", "important");
  banner.style.setProperty("transform", "translateY(-50%)", "important");

  const bannerWidth = banner.getBoundingClientRect().width;
  const minLeft = boardRect.left + Math.max(6, boardRect.width * 0.012);
  const leftViewport = Math.max(minLeft, bannerRight - bannerWidth);

  let centerY = boardRect.top + boardRect.height / 2;
  if (terrainSlots.length >= 2) {
    const upper = terrainSlots[0];
    const lower = terrainSlots[terrainSlots.length - 1];
    // Exact midpoint of the free vertical lane between both Terreno Cruel slots.
    centerY = (upper.bottom + lower.top) / 2;
  }

  banner.style.setProperty("left", px(leftViewport - boardRect.left), "important");
  banner.style.setProperty("top", px(centerY - boardRect.top), "important");
  banner.dataset.geometryAnchored = "true";
}

export default function TargetBannerPositionGuard() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(positionTargetBanner);
    };

    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });

    const resize = new ResizeObserver(schedule);
    const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
    if (board) resize.observe(board);

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  return null;
}

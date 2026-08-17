"use client";

import { useEffect } from "react";

const px = (value: number) => `${Math.round(value * 1000) / 1000}px`;

const visibleRects = (board: HTMLElement, selector: string) => {
  const boardRect = board.getBoundingClientRect();
  return Array.from(board.querySelectorAll<HTMLElement>(selector))
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > boardRect.left && rect.left < boardRect.right && rect.bottom > boardRect.top && rect.top < boardRect.bottom);
};

const laneCenterY = (board: HTMLElement) => {
  const boardRect = board.getBoundingClientRect();
  const terrains = visibleRects(board, ".terrain-slot").sort((a, b) => a.top - b.top);
  if (terrains.length >= 2) return (terrains[0].bottom + terrains[terrains.length - 1].top) / 2;
  return boardRect.top + boardRect.height / 2;
};

function positionCompactBanner(
  board: HTMLElement,
  banner: HTMLElement,
  anchor: "left" | "right",
) {
  const boardRect = board.getBoundingClientRect();
  const creatureSlots = visibleRects(board, ".creature-slot");
  if (!creatureSlots.length) return;

  const firstCreatureLeft = Math.min(...creatureSlots.map((rect) => rect.left));
  const lastCreatureRight = Math.max(...creatureSlots.map((rect) => rect.right));
  const gap = Math.max(8, Math.min(24, boardRect.width * 0.014));
  const edgePadding = Math.max(6, boardRect.width * 0.01);
  const centerY = laneCenterY(board);

  banner.style.setProperty("position", "absolute", "important");
  banner.style.setProperty("width", "max-content", "important");
  banner.style.setProperty("min-width", "0", "important");
  banner.style.setProperty("max-width", `${Math.max(150, Math.min(330, boardRect.width * 0.285))}px`, "important");
  banner.style.setProperty("height", "auto", "important");
  banner.style.setProperty("min-height", "0", "important");
  banner.style.setProperty("max-height", "none", "important");
  banner.style.setProperty("right", "auto", "important");
  banner.style.setProperty("bottom", "auto", "important");
  banner.style.setProperty("margin", "0", "important");
  banner.style.setProperty("padding", "clamp(.38rem,.72cqh,.68rem) clamp(.55rem,.8cqw,.85rem)", "important");
  banner.style.setProperty("transform", "translateY(-50%)", "important");
  banner.style.setProperty("z-index", "68", "important");

  const width = banner.getBoundingClientRect().width;
  let leftViewport: number;

  if (anchor === "left") {
    const bannerRight = firstCreatureLeft - gap;
    leftViewport = Math.max(boardRect.left + edgePadding, bannerRight - width);
  } else {
    const sidePileRects = visibleRects(board, ".side-piles");
    const rightLimit = sidePileRects.length
      ? Math.min(...sidePileRects.filter((rect) => rect.left > lastCreatureRight).map((rect) => rect.left), boardRect.right - edgePadding)
      : boardRect.right - edgePadding;
    const desiredLeft = lastCreatureRight + gap;
    leftViewport = Math.min(desiredLeft, Math.max(lastCreatureRight + 4, rightLimit - width - gap));
    leftViewport = Math.max(boardRect.left + edgePadding, Math.min(leftViewport, boardRect.right - width - edgePadding));
  }

  banner.style.setProperty("left", px(leftViewport - boardRect.left), "important");
  banner.style.setProperty("top", px(centerY - boardRect.top), "important");
  banner.dataset.geometryAnchored = anchor;
}

function stylePlacementTargets(board: HTMLElement) {
  const active = Array.from(board.querySelectorAll<HTMLElement>(".field-slot.placement-target"));
  const activeSet = new Set(active);

  for (const slot of Array.from(board.querySelectorAll<HTMLElement>(".field-slot"))) {
    if (activeSet.has(slot)) {
      slot.style.setProperty("cursor", "pointer", "important");
      slot.style.setProperty("outline", "clamp(1px,.14cqw,2px) solid var(--gold, #e4b13f)", "important");
      slot.style.setProperty("outline-offset", "clamp(1px,.12cqw,3px)", "important");
      slot.style.setProperty("box-shadow", "0 0 clamp(.45rem,1.1cqw,1rem) color-mix(in srgb, var(--gold, #e4b13f) 72%, transparent)", "important");
      slot.style.setProperty("filter", "brightness(1.18)", "important");
      slot.dataset.cafePlacementHighlighted = "true";
    } else if (slot.dataset.cafePlacementHighlighted === "true") {
      slot.style.removeProperty("cursor");
      slot.style.removeProperty("outline");
      slot.style.removeProperty("outline-offset");
      slot.style.removeProperty("box-shadow");
      slot.style.removeProperty("filter");
      delete slot.dataset.cafePlacementHighlighted;
    }
  }
}

function positionBoardDecisionBanners() {
  const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
  if (!board) return;

  const normalTargetBanner = board.querySelector<HTMLElement>(":scope > .target-banner:not(.cafe-time-placement-banner)");
  const cafeTimeBanner = board.querySelector<HTMLElement>(":scope > .cafe-time-placement-banner");

  if (normalTargetBanner) positionCompactBanner(board, normalTargetBanner, "left");
  if (cafeTimeBanner) positionCompactBanner(board, cafeTimeBanner, "right");
  stylePlacementTargets(board);
}

export default function TargetBannerPositionGuard() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(positionBoardDecisionBanners);
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

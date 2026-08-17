"use client";

import { useEffect } from "react";

/**
 * Anchors the response window to the opponent pile cluster in the upper-right
 * quadrant. We deliberately use geometry instead of DOM order because both
 * players render identical pile-zone markup and DOM order is not a reliable
 * indication of which pile belongs to the opponent.
 */
export default function ResponseWindowAnchor() {
  useEffect(() => {
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const visibleRect = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      return node.offsetParent !== null && rect.width > 0 && rect.height > 0 ? rect : null;
    };

    const sync = () => {
      frame = 0;
      const game = document.querySelector<HTMLElement>(".screen-game");
      if (!game) return;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const fallbackRight = Math.max(8, Math.min(24, viewportWidth * 0.0125));
      const fallbackTop = Math.max(44, Math.min(76, viewportHeight * 0.065));

      const allDecks = [...game.querySelectorAll<HTMLElement>(".pile-zone.main-deck")]
        .map((node) => ({ node, rect: visibleRect(node) }))
        .filter((entry): entry is { node: HTMLElement; rect: DOMRect } => !!entry.rect);

      // The opponent pile cluster is always the upper-right one. Prefer a deck
      // clearly inside that quadrant; never trust the first deck in DOM order.
      const opponentDeckEntry = allDecks
        .filter(({ rect }) => rect.left + rect.width / 2 > viewportWidth * 0.56 && rect.top + rect.height / 2 < viewportHeight * 0.5)
        .sort((a, b) => {
          const vertical = a.rect.top - b.rect.top;
          return Math.abs(vertical) > 4 ? vertical : b.rect.right - a.rect.right;
        })[0];

      let right = fallbackRight;
      let top = fallbackTop;
      let pileWidth = Math.max(180, Math.min(300, viewportWidth * 0.16));
      let anchorValid = false;

      if (opponentDeckEntry) {
        const deckRect = opponentDeckEntry.rect;
        const nearbyPiles = [...game.querySelectorAll<HTMLElement>(".pile-zone")]
          .map((node) => ({ node, rect: visibleRect(node) }))
          .filter((entry): entry is { node: HTMLElement; rect: DOMRect } => !!entry.rect)
          .filter(({ rect }) => {
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const deckCenterX = deckRect.left + deckRect.width / 2;
            const horizontalReach = Math.max(deckRect.width * 3.4, 170);
            const verticalBottom = Math.min(viewportHeight * 0.5, deckRect.bottom + Math.max(deckRect.height * 2.6, 170));
            return centerX > viewportWidth * 0.55 && Math.abs(centerX - deckCenterX) <= horizontalReach && centerY >= deckRect.top - 12 && centerY <= verticalBottom;
          });

        const rects = nearbyPiles.length ? nearbyPiles.map(({ rect }) => rect) : [deckRect];
        const clusterLeft = Math.min(...rects.map((rect) => rect.left));
        const clusterRight = Math.max(...rects.map((rect) => rect.right));
        const clusterTop = Math.min(...rects.map((rect) => rect.top));
        const clusterWidth = Math.max(deckRect.width, clusterRight - clusterLeft);

        // Reject an impossible measurement. A stale/wrong pile must never be
        // allowed to push the response window to the left side of the screen.
        anchorValid = clusterRight > viewportWidth * 0.7 && clusterTop < viewportHeight * 0.5;
        if (anchorValid) {
          right = Math.max(8, Math.min(viewportWidth * 0.28, viewportWidth - clusterRight));
          top = Math.max(8, Math.min(viewportHeight * 0.46, clusterTop));
          pileWidth = Math.max(clusterWidth, deckRect.width);
        }
      }

      game.style.setProperty("--response-opponent-piles-right", `${right}px`);
      game.style.setProperty("--response-opponent-piles-top", `${top}px`);
      game.style.setProperty("--response-opponent-piles-width", `${pileWidth}px`);
      game.dataset.responseAnchor = anchorValid ? "opponent-upper-right-piles" : "upper-right-fallback";
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    schedule();
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    resizeObserver = new ResizeObserver(schedule);
    const game = document.querySelector<HTMLElement>(".screen-game");
    if (game) resizeObserver.observe(game);
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return null;
}

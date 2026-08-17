"use client";

import { useEffect } from "react";

/**
 * Keeps the response window attached to the opponent pile cluster instead of
 * relying on viewport guesses. The opponent deck is the uppermost main-deck
 * pile on the battlefield; its nearest ancestor containing all four pile zones
 * is used as the visual anchor.
 */
export default function ResponseWindowAnchor() {
  useEffect(() => {
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const sync = () => {
      frame = 0;
      const game = document.querySelector<HTMLElement>(".screen-game");
      if (!game) return;

      const decks = [...game.querySelectorAll<HTMLElement>(".pile-zone.main-deck")]
        .filter((node) => node.offsetParent !== null)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const opponentDeck = decks[0];
      if (!opponentDeck) return;

      let cluster: HTMLElement = opponentDeck;
      let cursor = opponentDeck.parentElement;
      while (cursor && cursor !== game) {
        const pileCount = cursor.querySelectorAll(".pile-zone").length;
        if (pileCount >= 4) {
          cluster = cursor;
          break;
        }
        cursor = cursor.parentElement;
      }

      const rect = cluster.getBoundingClientRect();
      const deckRect = opponentDeck.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Align the response dialog to the right edge of the opponent pile area
      // and to its top edge. Clamp only to the viewport safety margin.
      const right = Math.max(8, viewportWidth - rect.right);
      const top = Math.max(8, Math.min(deckRect.top, viewportHeight - 80));
      const pileWidth = Math.max(rect.width, deckRect.width);

      game.style.setProperty("--response-opponent-piles-right", `${right}px`);
      game.style.setProperty("--response-opponent-piles-top", `${top}px`);
      game.style.setProperty("--response-opponent-piles-width", `${pileWidth}px`);
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    schedule();
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });

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

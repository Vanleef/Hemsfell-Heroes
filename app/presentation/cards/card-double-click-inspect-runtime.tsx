"use client";

import { useEffect } from "react";

const CARD_SELECTOR = ".original-card[data-card-preview='true']";
const ACTIVE_GAMEPLAY_TARGET_CLASSES = [
  "target-ally",
  "target-enemy",
  "target-valid",
  "target-creature",
  "target-support",
  "target-terrain",
];

function cardFromEvent(event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest<HTMLElement>(CARD_SELECTOR) ?? null;
}

function isGameplayTarget(card: HTMLElement) {
  return ACTIVE_GAMEPLAY_TARGET_CLASSES.some((className) => card.classList.contains(className));
}

/**
 * Detailed card inspection interaction authority.
 *
 * The legacy CardPreviewRuntime still owns delayed hover previews. For detailed
 * inspection we deliberately suppress its old press-and-hold trigger at the
 * window capture phase, then expose a desktop-native double-click gesture.
 * The inspectable dataset is restored immediately after each pointer event so
 * semantic markup and other consumers keep seeing the canonical value.
 */
export default function CardDoubleClickInspectRuntime() {
  useEffect(() => {
    const suppressLegacyHold = (event: PointerEvent) => {
      if (!event.isPrimary || event.button > 0) return;
      const card = cardFromEvent(event);
      if (!card || card.dataset.cardInspectable !== "true") return;

      card.dataset.cardInspectable = "false";
      queueMicrotask(() => {
        if (card.isConnected) card.dataset.cardInspectable = "true";
      });
    };

    const inspectOnDoubleClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const card = cardFromEvent(event);
      if (!card || card.dataset.cardInspectable !== "true" || isGameplayTarget(card)) return;

      const page = Number(card.dataset.cardPage);
      if (!Number.isInteger(page) || page <= 0) return;

      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent("hemsfell:inspect-card", { detail: { page } }));
    };

    /* window capture runs before CardPreviewRuntime's document-capture handler,
       so the old long-press timer never starts. */
    window.addEventListener("pointerdown", suppressLegacyHold, true);
    document.addEventListener("dblclick", inspectOnDoubleClick, true);

    return () => {
      window.removeEventListener("pointerdown", suppressLegacyHold, true);
      document.removeEventListener("dblclick", inspectOnDoubleClick, true);
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

const LIST_SELECTOR = [
  ".visual-card-choice-grid",
  ".card-choice-grid",
  ".card-selection-grid",
  ".selection-card-grid",
  ".popup-card-list",
  ".choice-cards",
  ".hand-limit-choice-area",
  ".response-cards",
].join(",");

export default function CardListTooltipPortal() {
  useEffect(() => {
    let anchor: HTMLElement | null = null;
    let portal: HTMLElement | null = null;

    const removePortal = () => {
      portal?.remove();
      portal = null;
      anchor = null;
    };

    const positionPortal = () => {
      if (!anchor || !portal || !document.body.contains(anchor)) {
        removePortal();
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const gap = Math.max(8, Math.min(14, window.innerWidth * 0.008));
      const width = portal.offsetWidth || 230;
      const height = portal.offsetHeight || 120;
      const margin = 8;

      let left = rect.right + gap;
      if (left + width > window.innerWidth - margin) left = rect.left - width - gap;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

      let top = rect.top;
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));

      portal.style.left = `${left}px`;
      portal.style.top = `${top}px`;
    };

    const showFor = (card: HTMLElement) => {
      const source = card.querySelector<HTMLElement>(":scope > .card-tooltip");
      if (!source) return;

      removePortal();
      anchor = card;
      portal = source.cloneNode(true) as HTMLElement;
      portal.classList.add("card-list-tooltip-portal");
      portal.setAttribute("aria-hidden", "true");
      Object.assign(portal.style, {
        display: "flex",
        flexDirection: "column",
        gap: "5px",
        position: "fixed",
        inset: "auto",
        margin: "0",
        zIndex: "100000",
        pointerEvents: "none",
      });
      document.body.appendChild(portal);
      positionPortal();
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const card = target?.closest<HTMLElement>(".original-card");
      if (!card || !card.closest(LIST_SELECTOR)) return;
      if (event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
      showFor(card);
    };

    const onPointerOut = (event: PointerEvent) => {
      if (!anchor) return;
      const target = event.target as Element | null;
      const card = target?.closest<HTMLElement>(".original-card");
      if (card !== anchor) return;
      if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
      removePortal();
    };

    const onViewportChange = () => positionPortal();

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      removePortal();
    };
  }, []);

  return null;
}

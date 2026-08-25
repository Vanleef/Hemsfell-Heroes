"use client";

/* Floating UI's documented API exposes `refs.setFloating` during render.
   React's generic refs lint cannot distinguish that callback API. */
/* eslint-disable react-hooks/refs */

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useRef, useState } from "react";
import { RemoteCardArt } from "./remote-card-art";

type PreviewState = {
  reference: HTMLElement;
  page: number;
  name: string;
  expanded: boolean;
};

const CARD_SELECTOR = ".original-card[data-card-preview='true']";
const LONG_PRESS_MS = 520;
const TOUCH_SLOP_PX = 12;

function previewData(card: HTMLElement, expanded: boolean): PreviewState | null {
  const page = Number(card.dataset.cardPage || card.querySelector<HTMLElement>(".remote-card-art")?.dataset.page);
  const name = card.dataset.cardName || card.getAttribute("aria-label") || "Carta";
  return Number.isInteger(page) && page > 0 ? { reference: card, page, name, expanded } : null;
}

/**
 * One tooltip authority for every card surface.
 *
 * The compact rules copy remains beside the card in the React tree for
 * accessibility, but this runtime mirrors its DOM into a Floating UI portal.
 * That keeps previews outside overflow/contain/stacking contexts without
 * duplicating card-rule parsing in a second component.
 */
export default function CardPreviewRuntime() {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const suppressedClicks = useRef(new WeakSet<HTMLElement>());
  const { refs, floatingStyles, update } = useFloating({
    open: !!preview,
    placement: preview?.expanded ? "right" : "right-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(({ rects }) => Math.max(8, Math.min(16, rects.reference.width * 0.14))),
      flip({ fallbackPlacements: ["left-start", "bottom", "top"] }),
      shift({ padding: 8, crossAxis: true }),
      size({
        padding: 8,
        apply({ availableWidth, availableHeight, elements }) {
          elements.floating.style.setProperty("--card-preview-available-width", `${Math.max(0, availableWidth)}px`);
          elements.floating.style.setProperty("--card-preview-available-height", `${Math.max(0, availableHeight)}px`);
        },
      }),
    ],
  });

  useEffect(() => {
    refs.setReference(preview?.reference ?? null);
    const host = contentRef.current;
    if (!host || !preview) return;
    const source = preview.reference.querySelector<HTMLElement>(":scope > .card-tooltip");
    host.replaceChildren(...Array.from(source?.childNodes ?? []).map((node) => node.cloneNode(true)));
    void update();
  }, [preview, refs, update]);

  useEffect(() => {
    let longPressTimer = 0;
    let touchCard: HTMLElement | null = null;
    let touchStart = { x: 0, y: 0 };

    const clearLongPress = () => {
      window.clearTimeout(longPressTimer);
      longPressTimer = 0;
      touchCard = null;
    };

    const openFor = (card: HTMLElement, expanded: boolean) => {
      const next = previewData(card, expanded);
      if (next) setPreview(next);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
      openFor(card, false);
    };

    const onPointerOut = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
      setPreview((current) => current?.reference === card && !current.expanded ? null : current);
    };

    const onFocusIn = (event: FocusEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD_SELECTOR);
      if (card) openFor(card, false);
    };

    const onFocusOut = (event: FocusEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
      setPreview((current) => current?.reference === card && !current.expanded ? null : current);
    };

    const onPointerDown = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD_SELECTOR);
      if (preview?.expanded && !card && !refs.floating.current?.contains(event.target as Node)) setPreview(null);
      if (event.pointerType !== "touch" || !card) return;
      clearLongPress();
      touchCard = card;
      touchStart = { x: event.clientX, y: event.clientY };
      longPressTimer = window.setTimeout(() => {
        if (!touchCard) return;
        suppressedClicks.current.add(touchCard);
        openFor(touchCard, true);
        navigator.vibrate?.(18);
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!touchCard || Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) <= TOUCH_SLOP_PX) return;
      clearLongPress();
    };

    const onPointerEnd = () => {
      window.clearTimeout(longPressTimer);
      longPressTimer = 0;
      touchCard = null;
    };

    const onClickCapture = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || !suppressedClicks.current.has(card)) return;
      suppressedClicks.current.delete(card);
      event.preventDefault();
      event.stopPropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerEnd, true);
    document.addEventListener("pointercancel", onPointerEnd, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearLongPress();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerEnd, true);
      document.removeEventListener("pointercancel", onPointerEnd, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [preview?.expanded, refs.floating]);

  if (!preview) return null;
  return (
    <FloatingPortal>
      <section
        ref={refs.setFloating}
        style={floatingStyles}
        className={`card-tooltip card-preview-floating ${preview.expanded ? "is-expanded" : "is-compact"}`}
        role={preview.expanded ? "dialog" : "tooltip"}
        aria-modal={preview.expanded || undefined}
        aria-label={preview.expanded ? `Preview ampliado de ${preview.name}` : undefined}
      >
        {preview.expanded ? (
          <div className="card-preview-art">
            <RemoteCardArt page={preview.page} name={preview.name} priority />
          </div>
        ) : null}
        <div ref={contentRef} className="card-preview-copy" />
        {preview.expanded ? <button type="button" className="card-preview-close" onClick={() => setPreview(null)} aria-label="Fechar preview">×</button> : null}
      </section>
    </FloatingPortal>
  );
}

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
  title: string;
  meta: string;
  rules: string;
  keywords: string[];
};

const CARD_SELECTOR = ".original-card[data-card-preview='true']";
const LONG_PRESS_MS = 520;
const TOUCH_SLOP_PX = 12;

function previewData(card: HTMLElement, expanded: boolean): PreviewState | null {
  const page = Number(card.dataset.cardPage || card.querySelector<HTMLElement>(".remote-card-art")?.dataset.page);
  const name = card.dataset.cardName || card.getAttribute("aria-label") || "Carta";
  if (!Number.isInteger(page) || page <= 0) return null;

  /* Capture the semantic tooltip payload before opening the floating surface.
     The old implementation mounted an empty portal and cloned DOM into it in a
     later effect. Floating UI could measure/paint that empty intermediate state,
     producing the occasional long blank tooltip seen during hover. */
  const source = card.querySelector<HTMLElement>(":scope > .card-tooltip") ?? card.querySelector<HTMLElement>(".card-tooltip");
  const title = source?.querySelector<HTMLElement>(":scope > b")?.textContent?.trim() || name;
  const meta = source?.querySelector<HTMLElement>(":scope > em")?.textContent?.trim() || "";
  const richRules = source?.querySelector<HTMLElement>(".rich-card-text")?.textContent?.trim();
  const rules = richRules || Array.from(source?.children ?? [])
    .filter((element) => element.tagName !== "B" && element.tagName !== "EM" && !element.classList.contains("keyword-list"))
    .map((element) => element.textContent?.trim() || "")
    .filter(Boolean)
    .join(" ");
  const keywords = Array.from(source?.querySelectorAll<HTMLElement>(".keyword-list > *") ?? [])
    .map((element) => element.getAttribute("data-keyword") || element.textContent?.trim() || "")
    .filter(Boolean);

  return { reference: card, page, name, expanded, title, meta, rules, keywords };
}

/**
 * One tooltip authority for every card surface.
 *
 * The compact rules copy remains beside the card in the React tree for
 * accessibility, but this runtime reads that semantic source before opening a
 * Floating UI portal. The visible preview is therefore complete on its first
 * paint and never depends on a post-paint DOM cloning effect.
 */
export default function CardPreviewRuntime() {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const suppressedClicks = useRef(new WeakSet<HTMLElement>());
  const { refs, floatingStyles, isPositioned } = useFloating({
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
      if (!next) return;
      refs.setReference(card);
      setPreview(next);
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
  }, [preview?.expanded, refs]);

  if (!preview) return null;
  const visible = isPositioned;
  return (
    <FloatingPortal>
      <section
        ref={refs.setFloating}
        style={{ ...floatingStyles, visibility: visible ? "visible" : "hidden" }}
        className={`card-tooltip card-preview-floating ${preview.expanded ? "is-expanded" : "is-compact"}`}
        data-positioned={visible ? "true" : "false"}
        role={preview.expanded ? "dialog" : "tooltip"}
        aria-modal={preview.expanded || undefined}
        aria-label={preview.expanded ? `Preview ampliado de ${preview.name}` : undefined}
      >
        {preview.expanded ? (
          <div className="card-preview-art">
            <RemoteCardArt page={preview.page} name={preview.name} priority />
          </div>
        ) : null}
        <div className="card-preview-copy">
          <b>{preview.title}</b>
          {preview.meta ? <em>{preview.meta}</em> : null}
          {preview.rules ? <span className="card-preview-rules">{preview.rules}</span> : null}
          {preview.keywords.length ? <span className="card-preview-keywords">{preview.keywords.join(" · ")}</span> : null}
        </div>
        {preview.expanded ? <button type="button" className="card-preview-close" onClick={() => setPreview(null)} aria-label="Fechar preview">×</button> : null}
      </section>
    </FloatingPortal>
  );
}

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
import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteCardArt } from "./remote-card-art";

type GlossaryKind = "keyword" | "subtype";
type GlossaryTerm = {
  label: string;
  description: string;
  kind: GlossaryKind;
};
type RulePart = {
  text: string;
  term?: GlossaryTerm;
};
type PreviewState = {
  reference: HTMLElement;
  page: number;
  name: string;
  expanded: boolean;
  title: string;
  meta: string;
  rules: RulePart[];
  keywords: GlossaryTerm[];
  subtypes: GlossaryTerm[];
};
type GlossaryState = {
  reference: HTMLElement;
  term: GlossaryTerm;
};

const CARD_SELECTOR = ".original-card[data-card-preview='true']";
const NATIVE_TITLE_SELECTOR = `${CARD_SELECTOR}[title], ${CARD_SELECTOR} [title], [data-tip][title], .remote-card-art[title]`;
const INSPECTION_HOLD_MS = 1_000;
const HOLD_SLOP_PX = 12;
const TOOLTIP_HOVER_DELAY_MS = 1_000;
const TOOLTIP_CLOSE_DELAY_MS = 180;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
}

function subtypeTerm(label: string): GlossaryTerm {
  return {
    label,
    kind: "subtype",
    description: `Classificação de criatura. Cartas e efeitos que mencionam “${label}” podem interagir com esse grupo.`,
  };
}

function splitSubtypeParts(text: string, subtypes: GlossaryTerm[]): RulePart[] {
  if (!text || !subtypes.length) return text ? [{ text }] : [];
  const byName = new Map(subtypes.map((term) => [term.label.toLocaleLowerCase("pt-BR"), term]));
  const pattern = new RegExp(`(${subtypes.map((term) => escapeRegExp(term.label)).join("|")})`, "gi");
  return text.split(pattern).filter(Boolean).map((part) => ({
    text: part,
    term: byName.get(part.toLocaleLowerCase("pt-BR")),
  }));
}

function uniqueTerms(terms: GlossaryTerm[]) {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = `${term.kind}:${term.label.toLocaleLowerCase("pt-BR")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function previewData(card: HTMLElement, expanded: boolean): PreviewState | null {
  const page = Number(card.dataset.cardPage || card.querySelector<HTMLElement>(".remote-card-art")?.dataset.page);
  const name = card.dataset.cardName || card.getAttribute("aria-label") || "Carta";
  if (!Number.isInteger(page) || page <= 0) return null;

  const source = card.querySelector<HTMLElement>(":scope > .card-tooltip") ?? card.querySelector<HTMLElement>(".card-tooltip");
  const title = source?.querySelector<HTMLElement>(":scope > b")?.textContent?.trim() || name;
  const meta = source?.querySelector<HTMLElement>(":scope > em")?.textContent?.trim() || "";
  const subtypes = uniqueTerms((card.dataset.cardSubtypes || "")
    .split("·")
    .map((label) => label.trim())
    .filter(Boolean)
    .map(subtypeTerm));
  const richRules = source?.querySelector<HTMLElement>(".rich-card-text");
  const rules = richRules
    ? Array.from(richRules.childNodes).flatMap((node): RulePart[] => {
        const text = node.textContent || "";
        if (node instanceof HTMLElement && node.classList.contains("keyword-term")) {
          return [{
            text,
            term: {
              label: text.trim(),
              description: node.dataset.tip || "Palavra-chave com uma regra especial do jogo.",
              kind: "keyword",
            },
          }];
        }
        return splitSubtypeParts(text, subtypes);
      })
    : splitSubtypeParts(Array.from(source?.children ?? [])
        .filter((element) => element.tagName !== "B" && element.tagName !== "EM" && !element.classList.contains("keyword-list"))
        .map((element) => element.textContent?.trim() || "")
        .filter(Boolean)
        .join(" "), subtypes);
  const keywords = uniqueTerms(Array.from(source?.querySelectorAll<HTMLElement>(".keyword-list > *") ?? [])
    .map((element): GlossaryTerm => ({
      label: element.getAttribute("data-keyword") || element.textContent?.trim() || "",
      description: element.dataset.tip || "Palavra-chave com uma regra especial do jogo.",
      kind: "keyword",
    }))
    .filter((term) => Boolean(term.label)));

  return { reference: card, page, name, expanded, title, meta, rules, keywords, subtypes };
}

function stripNativeTitle(element: Element) {
  if (element.matches(NATIVE_TITLE_SELECTOR)) element.removeAttribute("title");
  element.querySelectorAll(NATIVE_TITLE_SELECTOR).forEach((child) => child.removeAttribute("title"));
}

/**
 * One interactive tooltip authority for every card surface.
 *
 * The semantic copy remains inside each card, while the visible surface is
 * rendered in a body-level Floating UI portal. Mouse hover must remain on the
 * same card for one second before opening. A short close delay then bridges
 * the gap from the card to the portal so users can enter it and inspect
 * glossary terms without losing the preview.
 */
export default function CardPreviewRuntime() {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [glossary, setGlossary] = useState<GlossaryState | null>(null);
  const suppressedClicks = useRef(new WeakSet<HTMLElement>());
  const closeTimer = useRef(0);
  const previewFloating = useFloating({
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
  const glossaryFloating = useFloating({
    open: !!glossary,
    placement: "top",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(7),
      flip({ fallbackPlacements: ["bottom", "right", "left"] }),
      shift({ padding: 8 }),
    ],
  });

  const cancelScheduledClose = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = 0;
  }, []);

  const closePreview = useCallback(() => {
    cancelScheduledClose();
    setGlossary(null);
    setPreview(null);
  }, [cancelScheduledClose]);

  const scheduleCompactClose = useCallback((reference?: HTMLElement) => {
    cancelScheduledClose();
    closeTimer.current = window.setTimeout(() => {
      setPreview((current) => {
        if (!current || current.expanded || reference && current.reference !== reference) return current;
        setGlossary(null);
        return null;
      });
    }, TOOLTIP_CLOSE_DELAY_MS);
  }, [cancelScheduledClose]);

  const openGlossary = useCallback((element: HTMLElement, term: GlossaryTerm) => {
    cancelScheduledClose();
    glossaryFloating.refs.setReference(element);
    setGlossary({ reference: element, term });
  }, [cancelScheduledClose, glossaryFloating.refs]);

  useEffect(() => {
    stripNativeTitle(document.documentElement);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "attributes" && record.target instanceof Element) stripNativeTitle(record.target);
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) stripNativeTitle(node);
        });
      });
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let holdTimer = 0;
    let holdCard: HTMLElement | null = null;
    let holdProgress: HTMLElement | null = null;
    let holdStart = { x: 0, y: 0 };
    let hoverTimer = 0;
    let hoverCard: HTMLElement | null = null;

    const clearHoverOpen = () => {
      window.clearTimeout(hoverTimer);
      hoverTimer = 0;
      hoverCard = null;
    };

    const clearInspectionHold = () => {
      window.clearTimeout(holdTimer);
      holdTimer = 0;
      holdCard = null;
      holdProgress?.remove();
      holdProgress = null;
    };

    const openFor = (card: HTMLElement, expanded: boolean) => {
      const next = previewData(card, expanded);
      if (!next) return;
      clearHoverOpen();
      cancelScheduledClose();
      setGlossary(null);
      previewFloating.refs.setReference(card);
      setPreview(next);
    };

    const scheduleHoverOpen = (card: HTMLElement) => {
      clearHoverOpen();
      hoverCard = card;
      hoverTimer = window.setTimeout(() => {
        const pendingCard = hoverCard;
        hoverTimer = 0;
        hoverCard = null;
        if (pendingCard?.isConnected) openFor(pendingCard, false);
      }, TOOLTIP_HOVER_DELAY_MS);
    };

    const beginInspectionHold = (card: HTMLElement, event: PointerEvent) => {
      clearInspectionHold();
      holdCard = card;
      holdStart = { x: event.clientX, y: event.clientY };
      const progress = document.createElement("span");
      progress.className = "card-inspection-hold-progress";
      progress.setAttribute("aria-hidden", "true");
      progress.style.setProperty("--card-inspection-hold-duration", `${INSPECTION_HOLD_MS}ms`);
      progress.append(document.createElement("i"));
      card.append(progress);
      holdProgress = progress;
      holdTimer = window.setTimeout(() => {
        const inspectedCard = holdCard;
        if (!inspectedCard?.isConnected) {
          clearInspectionHold();
          return;
        }
        suppressedClicks.current.add(inspectedCard);
        const page = Number(inspectedCard.dataset.cardPage);
        clearInspectionHold();
        closePreview();
        if (Number.isInteger(page) && page > 0) {
          window.dispatchEvent(new CustomEvent("hemsfell:inspect-card", { detail: { page } }));
          navigator.vibrate?.(18);
        }
      }, INSPECTION_HOLD_MS);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".card-preview-floating")) {
        cancelScheduledClose();
        return;
      }
      const card = target?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
      scheduleHoverOpen(card);
    };

    const onPointerOut = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const floating = target?.closest<HTMLElement>(".card-preview-floating");
      if (floating) {
        if (event.relatedTarget instanceof Node && floating.contains(event.relatedTarget)) return;
        scheduleCompactClose();
        return;
      }
      const card = target?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
      if (holdCard === card) clearInspectionHold();
      clearHoverOpen();
      scheduleCompactClose(card);
    };

    const onPointerDown = (event: PointerEvent) => {
      clearHoverOpen();
      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest<HTMLElement>(CARD_SELECTOR);
      const insidePreview = event.target instanceof Node && previewFloating.refs.floating.current?.contains(event.target);
      if (!insidePreview) closePreview();
      if (!card || card.dataset.cardInspectable !== "true" || !event.isPrimary || event.button > 0) return;
      beginInspectionHold(card, event);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!holdCard || Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) <= HOLD_SLOP_PX) return;
      clearInspectionHold();
    };

    const onClickCapture = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || !suppressedClicks.current.has(card)) return;
      suppressedClicks.current.delete(card);
      event.preventDefault();
      event.stopPropagation();
    };

    const onContextMenu = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || card !== holdCard && !suppressedClicks.current.has(card)) return;
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    const onDragStart = () => {
      clearHoverOpen();
      clearInspectionHold();
      closePreview();
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", clearInspectionHold, true);
    document.addEventListener("pointercancel", clearInspectionHold, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("dragstart", onDragStart, true);

    return () => {
      clearHoverOpen();
      clearInspectionHold();
      cancelScheduledClose();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", clearInspectionHold, true);
      document.removeEventListener("pointercancel", clearInspectionHold, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("dragstart", onDragStart, true);
    };
  }, [cancelScheduledClose, closePreview, previewFloating.refs, scheduleCompactClose]);

  if (!preview) return null;
  const visible = previewFloating.isPositioned;
  const renderTerm = (term: GlossaryTerm, key: string) => (
    <span
      key={key}
      className={`card-preview-term is-${term.kind}`}
      data-glossary-kind={term.kind}
      tabIndex={0}
      onPointerEnter={(event) => openGlossary(event.currentTarget, term)}
      onPointerLeave={() => setGlossary(null)}
      onFocus={(event) => openGlossary(event.currentTarget, term)}
      onBlur={() => setGlossary(null)}
    >
      {term.label}
    </span>
  );

  return (
    <>
      <FloatingPortal>
        <section
          ref={previewFloating.refs.setFloating}
          style={{ ...previewFloating.floatingStyles, visibility: visible ? "visible" : "hidden" }}
          className={`card-tooltip card-preview-floating ${preview.expanded ? "is-expanded" : "is-compact"}`}
          data-positioned={visible ? "true" : "false"}
          role={preview.expanded ? "dialog" : "tooltip"}
          aria-modal={preview.expanded || undefined}
          aria-label={preview.expanded ? `Preview ampliado de ${preview.name}` : undefined}
          onPointerEnter={cancelScheduledClose}
          onPointerLeave={() => scheduleCompactClose()}
        >
          {preview.expanded ? (
            <div className="card-preview-art">
              <RemoteCardArt page={preview.page} name={preview.name} priority />
            </div>
          ) : null}
          <div className="card-preview-copy">
            <b>{preview.title}</b>
            {preview.meta ? <em>{preview.meta}</em> : null}
            {preview.rules.length ? (
              <span className="card-preview-rules">
                {preview.rules.map((part, index) => part.term ? renderTerm(part.term, `rule-${index}`) : <span key={`rule-${index}`}>{part.text}</span>)}
              </span>
            ) : null}
            {preview.keywords.length ? (
              <span className="card-preview-taxonomy">
                <small>PALAVRAS-CHAVE</small>
                <span className="card-preview-term-list">
                  {preview.keywords.map((term, index) => renderTerm(term, `keyword-${index}`))}
                </span>
              </span>
            ) : null}
            {preview.subtypes.length ? (
              <span className="card-preview-taxonomy">
                <small>SUBTIPOS</small>
                <span className="card-preview-term-list">
                  {preview.subtypes.map((term, index) => renderTerm(term, `subtype-${index}`))}
                </span>
              </span>
            ) : null}
          </div>
          {preview.expanded ? <button type="button" className="card-preview-close" onClick={closePreview} aria-label="Fechar preview">×</button> : null}
        </section>
      </FloatingPortal>
      {glossary ? (
        <FloatingPortal>
          <aside
            ref={glossaryFloating.refs.setFloating}
            style={{
              ...glossaryFloating.floatingStyles,
              visibility: glossaryFloating.isPositioned ? "visible" : "hidden",
            }}
            className="card-glossary-floating"
            data-kind={glossary.term.kind}
            role="tooltip"
          >
            <b>{glossary.term.label}</b>
            <span>{glossary.term.description}</span>
          </aside>
        </FloatingPortal>
      ) : null}
    </>
  );
}

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
import { catalogCardByPage } from "../../data/catalog/card-catalog-index";
import { GAME_GLOSSARY, gameGlossaryEntry } from "../glossary/game-glossary";
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
const INLINE_TOOLTIP_SELECTOR = ".original-card > .card-tooltip:not(.card-preview-floating)";
const HAND_SELECTOR = ".player-hand,.opponent-hand";
const ASSET_CONTEXT_CHANGE_EVENT = "hemsfell:asset-context-change";
const INSPECTION_HOLD_MS = 1_000;
const INSPECTION_PROGRESS_DELAY_MS = 500;
const INSPECTION_PROGRESS_MS = INSPECTION_HOLD_MS - INSPECTION_PROGRESS_DELAY_MS;
const HOLD_SLOP_PX = 12;
const TOOLTIP_HOVER_DELAY_MS = 1_000;
const TOOLTIP_CLOSE_DELAY_MS = 180;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function subtypeTerm(label: string): GlossaryTerm {
  return {
    label,
    kind: "subtype",
    description: `Classificação de criatura. Cartas e efeitos que mencionam “${label}” podem interagir com esse grupo.`,
  };
}

function glossaryTerm(label: string): GlossaryTerm | null {
  const entry = gameGlossaryEntry(label);
  if (!entry) return null;
  return { label: entry.label, description: entry.description, kind: "keyword" };
}

const CARD_RULE_GLOSSARY_TERMS = Object.values(GAME_GLOSSARY)
  .filter((entry) => ["keyword", "positive", "negative", "state"].includes(entry.tone))
  .flatMap((entry) => [entry.label, ...(entry.aliases || [])])
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

function uniqueTerms(terms: GlossaryTerm[]) {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = `${term.kind}:${normalized(term.label)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ruleParts(text: string, subtypes: GlossaryTerm[]) {
  if (!text) return [] as RulePart[];
  const glossaryLabels = CARD_RULE_GLOSSARY_TERMS.filter((label) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(label)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text),
  );
  const labels = [...new Set([...glossaryLabels, ...subtypes.map((term) => term.label)])].sort((a, b) => b.length - a.length);
  if (!labels.length) return [{ text }];
  const subtypeByName = new Map(subtypes.map((term) => [normalized(term.label), term]));
  const pattern = new RegExp(`(${labels.map(escapeRegExp).join("|")})`, "giu");
  return text.split(pattern).filter(Boolean).map((part): RulePart => {
    const subtype = subtypeByName.get(normalized(part));
    if (subtype) return { text: part, term: subtype };
    const term = glossaryTerm(part);
    return term ? { text: part, term } : { text: part };
  });
}

function previewData(card: HTMLElement, expanded: boolean): PreviewState | null {
  const page = Number(card.dataset.cardPage || card.querySelector<HTMLElement>(".remote-card-art")?.dataset.page);
  if (!Number.isInteger(page) || page <= 0) return null;
  const catalogCard = catalogCardByPage(page);
  const name = catalogCard?.name || card.dataset.cardName || card.getAttribute("aria-label") || "Carta";
  const subtypes = uniqueTerms((card.dataset.cardSubtypes || "")
    .split("·")
    .map((label) => label.trim())
    .filter(Boolean)
    .map(subtypeTerm));
  const cost = Number(catalogCard?.cost);
  const atk = Number(catalogCard && "atk" in catalogCard ? catalogCard.atk : NaN);
  const hp = Number(catalogCard && "hp" in catalogCard ? catalogCard.hp : NaN);
  const meta = [
    catalogCard?.type || "",
    subtypes.map((term) => term.label).join(" · "),
    Number.isFinite(cost) ? `custo ${cost}` : "",
    Number.isFinite(atk) && Number.isFinite(hp) ? `${atk} / ${hp}` : "",
  ].filter(Boolean).join(" · ");
  const text = String(catalogCard?.text || "").trim();
  const rules = ruleParts(text, subtypes);
  const tagTerms = Array.isArray(catalogCard?.tags)
    ? catalogCard.tags.map((tag) => glossaryTerm(String(tag))).filter((term): term is GlossaryTerm => Boolean(term))
    : [];
  const inlineTerms = rules.flatMap((part) => part.term?.kind === "keyword" ? [part.term] : []);
  const keywords = uniqueTerms([...tagTerms, ...inlineTerms]);
  return { reference: card, page, name, expanded, title: name, meta, rules, keywords, subtypes };
}

function stripNativeTitle(element: Element) {
  if (element.matches(NATIVE_TITLE_SELECTOR)) element.removeAttribute("title");
  element.querySelectorAll(NATIVE_TITLE_SELECTOR).forEach((child) => child.removeAttribute("title"));
}

function pruneInlineSemanticTooltips(root: ParentNode) {
  const candidates: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(INLINE_TOOLTIP_SELECTOR)) candidates.push(root);
  root.querySelectorAll<HTMLElement>(INLINE_TOOLTIP_SELECTOR).forEach((tooltip) => candidates.push(tooltip));
  for (const tooltip of candidates) {
    if (tooltip.closest(HAND_SELECTOR)) continue;
    tooltip.remove();
  }
}

function matchGestureOwnedByMobileRuntime(card: HTMLElement, event: PointerEvent) {
  if (!card.closest(".screen-game")) return false;
  return event.pointerType === "touch" || event.pointerType === "pen" || window.matchMedia("(pointer: coarse)").matches;
}

/**
 * One interactive tooltip authority for every card surface. Preview content is
 * reconstructed from the canonical catalogue on demand, so collection/setup
 * cards no longer need to keep a complete hidden tooltip subtree alive.
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
    middleware: [offset(7), flip({ fallbackPlacements: ["bottom", "right", "left"] }), shift({ padding: 8 })],
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
    const root = document.querySelector<HTMLElement>("main.hh-app");
    if (!root) return;
    stripNativeTitle(root);
    pruneInlineSemanticTooltips(root);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof Element) stripNativeTitle(record.target);
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          stripNativeTitle(node);
          pruneInlineSemanticTooltips(node);
        }
      }
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let holdDelayTimer = 0;
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
      window.clearTimeout(holdDelayTimer);
      window.clearTimeout(holdTimer);
      holdDelayTimer = 0;
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
      holdDelayTimer = window.setTimeout(() => {
        if (holdCard !== card || !card.isConnected) {
          clearInspectionHold();
          return;
        }
        const progress = document.createElement("span");
        progress.className = "card-inspection-hold-progress";
        progress.setAttribute("aria-hidden", "true");
        progress.style.setProperty("--card-inspection-hold-duration", `${INSPECTION_PROGRESS_MS}ms`);
        progress.append(document.createElement("i"));
        card.append(progress);
        holdProgress = progress;
        holdDelayTimer = 0;
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
        }, INSPECTION_PROGRESS_MS);
      }, INSPECTION_PROGRESS_DELAY_MS);
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
      if (matchGestureOwnedByMobileRuntime(card, event)) return;
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
    const onAssetContextChange = () => {
      clearHoverOpen();
      clearInspectionHold();
      cancelScheduledClose();
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
    window.addEventListener(ASSET_CONTEXT_CHANGE_EVENT, onAssetContextChange);

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
      window.removeEventListener(ASSET_CONTEXT_CHANGE_EVENT, onAssetContextChange);
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
            style={{ ...glossaryFloating.floatingStyles, visibility: glossaryFloating.isPositioned ? "visible" : "hidden" }}
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

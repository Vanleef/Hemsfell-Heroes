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

type GlossaryKind = "keyword" | "subtype" | "rule" | "positive" | "negative";
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
const NATIVE_TITLE_SELECTOR = `${CARD_SELECTOR}[title], ${CARD_SELECTOR} [title], [data-tip][title], [data-game-tip][title], .remote-card-art[title]`;
const LONG_PRESS_MS = 520;
const TOUCH_SLOP_PX = 12;
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
              kind: (node.dataset.glossaryKind as GlossaryKind) || "keyword",
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
      kind: (element.dataset.glossaryKind as GlossaryKind) || "keyword",
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
 * rendered in a body-level Floating UI portal. A short close delay bridges the
 * gap from the card to the portal so users can enter it and inspect glossary
 * terms without losing the preview.
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
    const gameTip = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("[data-game-tip]") : null;
    const showGameTip = (trigger: HTMLElement) => {
      const description = trigger.dataset.gameTip?.trim();
      if (!description) return;
      openGlossary(trigger, {
        label: trigger.dataset.gameTipLabel || trigger.getAttribute("aria-label")?.split(":")[0] || "Regra",
        description,
        kind: (trigger.dataset.gameTipKind as GlossaryKind) || "rule",
      });
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const trigger = gameTip(event.target);
      if (!trigger || event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget)) return;
      showGameTip(trigger);
    };
    const onPointerOut = (event: PointerEvent) => {
      const trigger = gameTip(event.target);
      if (!trigger || event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget)) return;
      setGlossary((current) => current?.reference === trigger ? null : current);
    };
    const onFocusIn = (event: FocusEvent) => {
      const trigger = gameTip(event.target);
      if (trigger) showGameTip(trigger);
    };
    const onFocusOut = (event: FocusEvent) => {
      const trigger = gameTip(event.target);
      if (!trigger || event.relatedTarget instanceof Node && trigger.contains(event.relatedTarget)) return;
      setGlossary((current) => current?.reference === trigger ? null : current);
    };
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, [openGlossary]);

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
      cancelScheduledClose();
      setGlossary(null);
      previewFloating.refs.setReference(card);
      setPreview(next);
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
      openFor(card, false);
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
      scheduleCompactClose(card);
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".card-preview-floating")) {
        cancelScheduledClose();
        return;
      }
      const card = target?.closest<HTMLElement>(CARD_SELECTOR);
      if (card) openFor(card, false);
    };

    const onFocusOut = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const floating = target?.closest<HTMLElement>(".card-preview-floating");
      if (floating) {
        if (event.relatedTarget instanceof Node && floating.contains(event.relatedTarget)) return;
        scheduleCompactClose();
        return;
      }
      const card = target?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
      scheduleCompactClose(card);
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest<HTMLElement>(CARD_SELECTOR);
      const insidePreview = event.target instanceof Node && previewFloating.refs.floating.current?.contains(event.target);
      if (preview?.expanded && !card && !insidePreview) closePreview();
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

    const onClickCapture = (event: MouseEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(CARD_SELECTOR);
      if (!card || !suppressedClicks.current.has(card)) return;
      suppressedClicks.current.delete(card);
      event.preventDefault();
      event.stopPropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", clearLongPress, true);
    document.addEventListener("pointercancel", clearLongPress, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearLongPress();
      cancelScheduledClose();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", clearLongPress, true);
      document.removeEventListener("pointercancel", clearLongPress, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cancelScheduledClose, closePreview, preview?.expanded, previewFloating.refs, scheduleCompactClose]);

  if (!preview && !glossary) return null;
  const visible = !!preview && previewFloating.isPositioned;
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
      {preview ? (
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
      ) : null}
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

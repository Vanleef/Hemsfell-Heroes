"use client";

import { useEffect } from "react";

const HAND_SELECTOR = ".screen-game .player-hand, .screen-game .opponent-hand";
const HAND_FRAME_SELECTOR = ".screen-game .player-hand > .card-frame, .screen-game .opponent-hand > .card-frame";
const FIELD_FRAME_SELECTOR = ".screen-game :is(.paired-field .field-slot,.terrain-slot) > .card-frame[data-unit-id]";
const HAND_ITEM_SELECTOR = ".card-frame,.opponent-card-back,.official-card-back";

function densityFor(count: number) {
  const overflow = Math.max(0, count - 4);
  return {
    scale: Math.max(0.78, 1 - overflow * 0.035),
    overlapCqi: Math.min(2.7, overflow * 0.38),
  };
}

function ensureMetric(card: HTMLElement, kind: "cost" | "atk" | "hp", value: string) {
  let metric = card.querySelector<HTMLElement>(`:scope > .hh-hand-${kind}`);
  if (!metric) {
    metric = document.createElement("span");
    metric.className = `hh-hand-metric hh-hand-${kind}`;
    metric.setAttribute("aria-hidden", "true");
    card.append(metric);
  }
  if (metric.textContent !== value) metric.textContent = value;
}

function removeMetric(card: HTMLElement, kind: "cost" | "atk" | "hp") {
  card.querySelector<HTMLElement>(`:scope > .hh-hand-${kind}`)?.remove();
}

function syncHandCard(frame: HTMLElement, index: number) {
  frame.style.setProperty("--hh-hand-order", String(index + 1));
  frame.dataset.hhHandFrame = "true";
  const card = frame.querySelector<HTMLElement>(":scope > .original-card");
  if (!card) return;

  card.dataset.hhHandCard = "true";
  const summary = card.querySelector<HTMLElement>(":scope > .card-tooltip > em")?.textContent?.trim() || "";
  const cost = summary.match(/\bcusto\s+(-?\d+)/i)?.[1];
  if (cost != null) ensureMetric(card, "cost", cost);
  else removeMetric(card, "cost");

  const creature = /^Criatura\b/i.test(summary);
  card.dataset.hhHandCreature = creature ? "true" : "false";
  const stats = creature ? summary.match(/(-?\d+)\s*\/\s*(-?\d+)\s*$/) : null;
  if (stats) {
    ensureMetric(card, "atk", stats[1]);
    ensureMetric(card, "hp", stats[2]);
  } else {
    removeMetric(card, "atk");
    removeMetric(card, "hp");
  }
}

function syncHand(hand: HTMLElement) {
  const items = Array.from(hand.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && child.matches(HAND_ITEM_SELECTOR),
  );
  const count = items.length;
  const density = densityFor(count);
  hand.dataset.hhHandCount = String(count);
  hand.style.setProperty("--hh-hand-count", String(Math.max(1, count)));
  hand.style.setProperty("--hh-hand-scale", density.scale.toFixed(3));
  hand.style.setProperty("--hh-hand-card-height", `${(92 * density.scale).toFixed(2)}%`);
  hand.style.setProperty("--hh-opponent-card-height", `${(74 * density.scale).toFixed(2)}%`);
  hand.style.setProperty("--hh-hand-overlap", `${density.overlapCqi.toFixed(2)}cqi`);
  items.forEach((item, index) => {
    item.style.setProperty("--hh-hand-order", String(index + 1));
    if (item.classList.contains("card-frame")) syncHandCard(item, index);
  });
}

function quarterTurnAngle(transform: string) {
  if (!transform || transform === "none" || typeof DOMMatrixReadOnly === "undefined") return false;
  try {
    const matrix = new DOMMatrixReadOnly(transform);
    const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    const normalized = ((angle % 180) + 180) % 180;
    return Math.abs(normalized - 90) <= 24;
  } catch {
    return false;
  }
}

function syncCardPresentationState(frame: HTMLElement) {
  const card = frame.querySelector<HTMLElement>(":scope > .original-card");
  if (!card) return;
  const presenting = card.classList.contains("hh-presentation-hidden") || card.classList.contains("is-impacting");
  if (presenting) frame.dataset.hhCardPresenting = "true";
  else delete frame.dataset.hhCardPresenting;

  if (quarterTurnAngle(getComputedStyle(card).transform)) frame.dataset.hhLocalRotation = "quarter";
  else delete frame.dataset.hhLocalRotation;
}

function syncAiUi() {
  const thinking = document.querySelector<HTMLElement>("[data-hemsfell-ai-thinking]");
  if (thinking) {
    const current = thinking.textContent || "";
    const next = current
      .replace(/IA avaliando prioridade/gi, "IA pensando")
      .replace(/A IA está avaliando a prioridade/gi, "IA pensando");
    if (next !== current) thinking.textContent = next;
    thinking.dataset.hhAiUnified = "true";
  }

  document.querySelectorAll<HTMLElement>(".screen-game .response-waiting").forEach((waiting) => {
    const copy = waiting.textContent || "";
    const aiWait = /IA\s+(?:está\s+)?(?:avaliando\s+a\s+prioridade|pensando)/i.test(copy);
    if (aiWait) waiting.dataset.hhAiBotWait = "true";
    else delete waiting.dataset.hhAiBotWait;
  });
}

function activeFrameFrom(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(HAND_FRAME_SELECTOR);
}

function setActiveFrame(frame: HTMLElement | null) {
  document.querySelectorAll<HTMLElement>(`${HAND_FRAME_SELECTOR}[data-hh-hand-active=\"true\"]`).forEach((current) => {
    if (current !== frame) delete current.dataset.hhHandActive;
  });
  if (frame) frame.dataset.hhHandActive = "true";
}

export default function HandAiUiRuntime() {
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        document.querySelectorAll<HTMLElement>(HAND_SELECTOR).forEach(syncHand);
        document.querySelectorAll<HTMLElement>(FIELD_FRAME_SELECTOR).forEach(syncCardPresentationState);
        syncAiUi();
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      const handFrame = activeFrameFrom(event.target);
      if (handFrame) setActiveFrame(handFrame);
      else if (event.target instanceof Element && !event.target.closest(".screen-game .player-hand")) setActiveFrame(null);
    };
    const onFocusIn = (event: FocusEvent) => {
      const handFrame = activeFrameFrom(event.target);
      if (handFrame) setActiveFrame(handFrame);
    };
    const onDragStart = (event: DragEvent) => {
      const handFrame = activeFrameFrom(event.target);
      if (handFrame) setActiveFrame(handFrame);
    };
    const onAiThinking = () => queueMicrotask(syncAiUi);

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-card-id", "data-card-page"],
    });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("dragstart", onDragStart, true);
    window.addEventListener("hemsfell:ai-thinking", onAiThinking, true);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("dragstart", onDragStart, true);
      window.removeEventListener("hemsfell:ai-thinking", onAiThinking, true);
      document.querySelectorAll<HTMLElement>(".hh-hand-metric").forEach((node) => node.remove());
    };
  }, []);

  return null;
}

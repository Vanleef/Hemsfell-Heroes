"use client";

import { useEffect } from "react";
import { preloadRemoteCardCatalog, prewarmRemoteCardArtPages } from "../cards/remote-card-art";

const HAND_SELECTOR = ".screen-game .player-hand, .screen-game .opponent-hand";
const HAND_FRAME_SELECTOR = ".screen-game .player-hand > .card-frame, .screen-game .opponent-hand > .card-frame";
const PLAYER_HAND_FRAME_SELECTOR = ".screen-game .player-hand > .card-frame";
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

function warmHandArt(hand: HTMLElement, items: HTMLElement[]) {
  const pages = items.flatMap((item) =>
    Array.from(item.querySelectorAll<HTMLCanvasElement>("canvas.remote-card-art[data-page]"))
      .map((canvas) => Number(canvas.dataset.page))
      .filter((page) => Number.isFinite(page) && page > 0),
  );
  const key = [...new Set(pages)].join(",");
  if (!key || hand.dataset.hhWarmArtPages === key) return;
  hand.dataset.hhWarmArtPages = key;
  void prewarmRemoteCardArtPages(pages, 64);
}

function syncHand(hand: HTMLElement) {
  if (!hand.isConnected) return;
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
  warmHandArt(hand, items);
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

function playerFrameFrom(target: EventTarget | null) {
  const frame = activeFrameFrom(target);
  return frame?.matches(PLAYER_HAND_FRAME_SELECTOR) ? frame : null;
}

function setActiveFrame(frame: HTMLElement | null) {
  document.querySelectorAll<HTMLElement>(`${HAND_FRAME_SELECTOR}[data-hh-hand-active=\"true\"]`).forEach((current) => {
    if (current !== frame) delete current.dataset.hhHandActive;
  });
  if (frame) frame.dataset.hhHandActive = "true";
}

function clearPeekState() {
  document.querySelectorAll<HTMLElement>(`${PLAYER_HAND_FRAME_SELECTOR}[data-hh-hand-peek=\"true\"]`).forEach((current) => {
    delete current.dataset.hhHandPeek;
  });
  document.querySelectorAll<HTMLElement>(`${PLAYER_HAND_FRAME_SELECTOR}[data-hh-hand-neighbor]`).forEach((current) => {
    delete current.dataset.hhHandNeighbor;
  });
}

function setPeekFrame(frame: HTMLElement | null) {
  clearPeekState();
  if (!frame || !frame.matches(PLAYER_HAND_FRAME_SELECTOR)) return;

  frame.dataset.hhHandPeek = "true";
  const hand = frame.parentElement;
  if (!hand) return;
  const frames = Array.from(hand.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && child.classList.contains("card-frame"),
  );
  const index = frames.indexOf(frame);
  if (index < 0) return;
  const previous = frames[index - 1];
  const next = frames[index + 1];
  if (previous) previous.dataset.hhHandNeighbor = "left";
  if (next) next.dataset.hhHandNeighbor = "right";
}

function handFromNode(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>(HAND_SELECTOR) ?? null;
}

function nodeTouchesAiUi(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return !!element?.closest("[data-hemsfell-ai-thinking],.screen-game .response-waiting");
}

function fineHoverPointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export default function HandAiUiRuntime() {
  useEffect(() => {
    let frame = 0;
    let aiDirty = false;
    const dirtyHands = new Set<HTMLElement>();

    // Start PDF.js/document metadata as soon as the match runtime mounts. This
    // overlaps the network setup with the first React paint instead of waiting
    // for the user to interact with an individual card.
    void preloadRemoteCardCatalog().catch(() => undefined);

    const flush = () => {
      frame = 0;
      for (const hand of dirtyHands) syncHand(hand);
      dirtyHands.clear();
      if (aiDirty) {
        aiDirty = false;
        syncAiUi();
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const queueMountedHands = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLElement>(HAND_SELECTOR).forEach((hand) => dirtyHands.add(hand));
      schedule();
    };

    const onPointerDown = (event: PointerEvent) => {
      const handFrame = activeFrameFrom(event.target);
      if (handFrame) setActiveFrame(handFrame);
      const playerFrame = playerFrameFrom(event.target);
      if (playerFrame) setPeekFrame(playerFrame);
      else if (event.target instanceof Element && !event.target.closest(".screen-game .player-hand")) {
        setActiveFrame(null);
        setPeekFrame(null);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (fineHoverPointer()) {
        setPeekFrame(playerFrameFrom(event.target));
        return;
      }
      setPeekFrame(null);
    };
    const onPointerCancel = () => setPeekFrame(null);
    const onPointerOver = (event: PointerEvent) => {
      if (!fineHoverPointer()) return;
      const handFrame = playerFrameFrom(event.target);
      if (handFrame) setPeekFrame(handFrame);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!fineHoverPointer()) return;
      const current = playerFrameFrom(event.target);
      if (!current) return;
      const next = playerFrameFrom(event.relatedTarget);
      if (next === current) return;
      setPeekFrame(next);
    };
    const onFocusIn = (event: FocusEvent) => {
      const handFrame = activeFrameFrom(event.target);
      if (handFrame) setActiveFrame(handFrame);
      const playerFrame = playerFrameFrom(event.target);
      if (playerFrame) setPeekFrame(playerFrame);
    };
    const onFocusOut = (event: FocusEvent) => {
      const current = playerFrameFrom(event.target);
      const next = playerFrameFrom(event.relatedTarget);
      if (current && current !== next) setPeekFrame(next);
    };
    const onDragStart = (event: DragEvent) => {
      const handFrame = activeFrameFrom(event.target);
      if (handFrame) setActiveFrame(handFrame);
      const playerFrame = playerFrameFrom(event.target);
      if (playerFrame) setPeekFrame(playerFrame);
    };
    const onDragEnd = (event: DragEvent) => {
      if (fineHoverPointer()) setPeekFrame(playerFrameFrom(event.target));
      else setPeekFrame(null);
    };
    const onAiThinking = () => {
      aiDirty = true;
      schedule();
    };

    document.querySelectorAll<HTMLElement>("[data-hh-local-rotation],[data-hh-card-presenting]").forEach((node) => {
      delete node.dataset.hhLocalRotation;
      delete node.dataset.hhCardPresenting;
    });

    queueMountedHands();
    aiDirty = true;
    schedule();

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const hand = handFromNode(record.target);
        if (hand) dirtyHands.add(hand);
        if (nodeTouchesAiUi(record.target)) aiDirty = true;

        if (record.type !== "childList") continue;
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(HAND_SELECTOR)) dirtyHands.add(node as HTMLElement);
          node.querySelectorAll<HTMLElement>(HAND_SELECTOR).forEach((mountedHand) => dirtyHands.add(mountedHand));
          if (node.matches("[data-hemsfell-ai-thinking],.response-waiting") || node.querySelector("[data-hemsfell-ai-thinking],.response-waiting")) aiDirty = true;
        });
      }
      if (dirtyHands.size || aiDirty) schedule();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", onDragEnd, true);
    window.addEventListener("hemsfell:ai-thinking", onAiThinking, true);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragend", onDragEnd, true);
      window.removeEventListener("hemsfell:ai-thinking", onAiThinking, true);
      clearPeekState();
      document.querySelectorAll<HTMLElement>(".hh-hand-metric").forEach((node) => node.remove());
    };
  }, []);

  return null;
}

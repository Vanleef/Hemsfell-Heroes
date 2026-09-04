"use client";

import { useEffect } from "react";

const HAND_SELECTOR = ".screen-game .player-hand, .screen-game .opponent-hand";
const HAND_FRAME_SELECTOR = ".screen-game .player-hand > .card-frame, .screen-game .opponent-hand > .card-frame";
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

function setPeekFrame(frame: HTMLElement | null) {
  document.querySelectorAll<HTMLElement>(`${HAND_FRAME_SELECTOR}[data-hh-hand-peek=\"true\"]`).forEach((current) => {
    if (current !== frame) delete current.dataset.hhHandPeek;
  });
  if (frame) frame.dataset.hhHandPeek = "true";
}

function handFromNode(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>(HAND_SELECTOR) ?? null;
}

function nodeTouchesAiUi(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return !!element?.closest("[data-hemsfell-ai-thinking],.screen-game .response-waiting");
}

export default function HandAiUiRuntime() {
  useEffect(() => {
    let frame = 0;
    let aiDirty = false;
    const dirtyHands = new Set<HTMLElement>();

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
      if (handFrame) {
        setActiveFrame(handFrame);
        setPeekFrame(handFrame);
      } else if (event.target instanceof Element && !event.target.closest(".screen-game .player-hand")) {
        setActiveFrame(null);
        setPeekFrame(null);
      }
    };
    const clearPressedPeek = () => setPeekFrame(null);
    const onFocusIn = (event: FocusEvent) => {
      const handFrame = activeFrameFrom(event.target);
      if (handFrame) {
        setActiveFrame(handFrame);
        setPeekFrame(handFrame);
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      const current = activeFrameFrom(event.target);
      const next = activeFrameFrom(event.relatedTarget);
      if (current && current !== next) setPeekFrame(null);
    };
    const onDragStart = (event: DragEvent) => {
      const handFrame = activeFrameFrom(event.target);
      if (handFrame) {
        setActiveFrame(handFrame);
        setPeekFrame(handFrame);
      }
    };
    const onDragEnd = () => setPeekFrame(null);
    const onAiThinking = () => {
      aiDirty = true;
      schedule();
    };

    /* Drop legacy mirror attributes once. Presentation state is now derived in
       CSS from canonical classes instead of computed transforms. */
    document.querySelectorAll<HTMLElement>("[data-hh-local-rotation],[data-hh-card-presenting]").forEach((node) => {
      delete node.dataset.hhLocalRotation;
      delete node.dataset.hhCardPresenting;
    });

    queueMountedHands();
    aiDirty = true;
    schedule();

    /* Hand density used to observe every class mutation on the entire board and
       read computed transforms from every field card. During drag/targeting that
       caused forced style work on practically every pointer frame. Only DOM/text
       changes inside a hand can change hand metrics, so keep the observer narrow
       and never read battlefield geometry here. */
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
    document.addEventListener("pointerup", clearPressedPeek, true);
    document.addEventListener("pointercancel", clearPressedPeek, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", onDragEnd, true);
    window.addEventListener("hemsfell:ai-thinking", onAiThinking, true);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", clearPressedPeek, true);
      document.removeEventListener("pointercancel", clearPressedPeek, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragend", onDragEnd, true);
      window.removeEventListener("hemsfell:ai-thinking", onAiThinking, true);
      setPeekFrame(null);
      document.querySelectorAll<HTMLElement>(".hh-hand-metric").forEach((node) => node.remove());
    };
  }, []);

  return null;
}

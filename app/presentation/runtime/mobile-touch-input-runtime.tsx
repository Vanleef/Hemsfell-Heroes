"use client";

import { useEffect } from "react";

const DRAG_SOURCE_SELECTOR = ".screen-game [draggable='true']";
const DROP_ZONE_SELECTOR = ".screen-game .field-slot, .screen-game .terrain-slot";
const INSPECTABLE_CARD_SELECTOR = ".screen-game .original-card[data-card-inspectable='true']";
const TAP_CONTROL_SELECTOR = [
  ".screen-game button:not(.original-card):not(:disabled)",
  ".screen-game .original-card:is(.target-ally,.target-enemy,.combat-attack-ready):not(:disabled)",
  ".screen-game [role='button']:not([aria-disabled='true'])",
].join(",");

const DRAG_THRESHOLD_PX = 9;
const TAP_SLOP_PX = 10;
const TAP_MAX_DURATION_MS = 520;
const INSPECTION_HOLD_MS = 1_000;
const INSPECTION_PROGRESS_DELAY_MS = 500;
const INSPECTION_PROGRESS_MS = INSPECTION_HOLD_MS - INSPECTION_PROGRESS_DELAY_MS;
const HOLD_SLOP_PX = 12;

class TouchDataTransfer {
  dropEffect = "move";
  effectAllowed = "all";
  files = [] as unknown as FileList;
  items = [] as unknown as DataTransferItemList;
  types: string[] = [];
  private values = new Map<string, string>();

  clearData(format?: string) {
    if (format) this.values.delete(format);
    else this.values.clear();
    this.types = [...this.values.keys()];
  }

  getData(format: string) {
    return this.values.get(format) ?? "";
  }

  setData(format: string, data: string) {
    this.values.set(format, data);
    this.types = [...this.values.keys()];
  }

  setDragImage(_image: Element, _x: number, _y: number) {
    // Native drag images are desktop-only. Touch feedback is CSS-driven.
  }
}

type Point = { x: number; y: number };
type DropCandidate = { zone: HTMLElement; rect: DOMRectReadOnly };

type DragSession = {
  pointerId: number;
  source: HTMLElement | null;
  inspectCard: HTMLElement | null;
  startX: number;
  startY: number;
  startedAt: number;
  dragging: boolean;
  inspected: boolean;
  dataTransfer: TouchDataTransfer;
  dropCandidates: DropCandidate[];
  dropTarget: HTMLElement | null;
  latestPoint: Point;
  syncFrame: number;
  captured: boolean;
  sourcePointerEvents: string;
  sourcePointerEventsPriority: string;
  sourceAriaGrabbed: string | null;
  holdDelayTimer: number;
  holdTimer: number;
  holdProgress: HTMLElement | null;
};

function coarsePointer(event: PointerEvent) {
  return event.pointerType === "touch" || event.pointerType === "pen" || window.matchMedia("(pointer: coarse)").matches;
}

function dragEvent(type: string, dataTransfer: TouchDataTransfer, point: Point) {
  const event = typeof DragEvent === "function"
    ? new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: point.x,
        clientY: point.y,
      })
    : new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer, configurable: true },
    clientX: { value: point.x, configurable: true },
    clientY: { value: point.y, configurable: true },
  });
  return event;
}

function dispatchDrag(target: HTMLElement, type: string, dataTransfer: TouchDataTransfer, point: Point) {
  return target.dispatchEvent(dragEvent(type, dataTransfer, point));
}

function controlFrom(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(TAP_CONTROL_SELECTOR) : null;
}

function inspectableCardFrom(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(INSPECTABLE_CARD_SELECTOR) : null;
}

function pointInside(rect: DOMRectReadOnly, point: Point) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function zoneProbePoint(rect: DOMRectReadOnly): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function collectDropCandidates(dataTransfer: TouchDataTransfer) {
  const candidates: DropCandidate[] = [];
  document.querySelectorAll<HTMLElement>(DROP_ZONE_SELECTOR).forEach((zone) => {
    const rect = zone.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const acceptedByState = zone.classList.contains("can-drop");
    const acceptedByHandler = acceptedByState ? true : !dispatchDrag(zone, "dragover", dataTransfer, zoneProbePoint(rect));
    if (acceptedByHandler) candidates.push({ zone, rect });
  });
  return candidates;
}

function matchingDropZone(candidates: readonly DropCandidate[], point: Point) {
  for (const candidate of candidates) {
    if (candidate.zone.isConnected && pointInside(candidate.rect, point)) return candidate.zone;
  }
  return null;
}

export default function MobileTouchInputRuntime() {
  useEffect(() => {
    let session: DragSession | null = null;
    let suppressClicksUntil = 0;

    const clearInspectionHold = (current: DragSession) => {
      window.clearTimeout(current.holdDelayTimer);
      window.clearTimeout(current.holdTimer);
      current.holdDelayTimer = 0;
      current.holdTimer = 0;
      current.holdProgress?.remove();
      current.holdProgress = null;
    };

    const beginInspectionHold = (current: DragSession) => {
      const card = current.inspectCard;
      if (!card) return;
      current.holdDelayTimer = window.setTimeout(() => {
        if (session !== current || current.dragging || current.inspected || !card.isConnected) return;
        const progress = document.createElement("span");
        progress.className = "card-inspection-hold-progress";
        progress.setAttribute("aria-hidden", "true");
        progress.style.setProperty("--card-inspection-hold-duration", `${INSPECTION_PROGRESS_MS}ms`);
        progress.append(document.createElement("i"));
        card.append(progress);
        current.holdProgress = progress;
        current.holdDelayTimer = 0;
        current.holdTimer = window.setTimeout(() => {
          if (session !== current || current.dragging || !card.isConnected) return;
          const page = Number(card.dataset.cardPage);
          current.inspected = true;
          suppressClicksUntil = performance.now() + 500;
          clearInspectionHold(current);
          if (Number.isInteger(page) && page > 0) {
            window.dispatchEvent(new CustomEvent("hemsfell:inspect-card", { detail: { page } }));
            navigator.vibrate?.(18);
          }
        }, INSPECTION_PROGRESS_MS);
      }, INSPECTION_PROGRESS_DELAY_MS);
    };

    const restoreSource = (current: DragSession) => {
      const source = current.source;
      if (!source) return;
      source.classList.remove("hh-touch-drag-source");
      if (current.sourcePointerEvents) {
        source.style.setProperty("pointer-events", current.sourcePointerEvents, current.sourcePointerEventsPriority);
      } else {
        source.style.removeProperty("pointer-events");
      }
      if (current.sourceAriaGrabbed == null) source.removeAttribute("aria-grabbed");
      else source.setAttribute("aria-grabbed", current.sourceAriaGrabbed);
      if (current.captured && source.hasPointerCapture?.(current.pointerId)) {
        try { source.releasePointerCapture(current.pointerId); } catch { /* pointer already released */ }
      }
    };

    const cleanup = (point: Point, emitDragEnd = true) => {
      if (!session) return;
      const current = session;
      session = null;
      clearInspectionHold(current);
      if (current.syncFrame) cancelAnimationFrame(current.syncFrame);
      if (current.dropTarget) {
        current.dropTarget.classList.remove("hh-touch-drop-target");
        dispatchDrag(current.dropTarget, "dragleave", current.dataTransfer, point);
      }
      restoreSource(current);
      document.documentElement.classList.remove("hh-touch-drag-active");
      document.body.removeAttribute("data-hh-touch-dragging");
      if (emitDragEnd && current.dragging && current.source) dispatchDrag(current.source, "dragend", current.dataTransfer, point);
    };

    const updateDropTarget = (current: DragSession, point: Point) => {
      if (!current.dragging) return null;
      current.latestPoint = point;
      const next = matchingDropZone(current.dropCandidates, point);
      if (next !== current.dropTarget) {
        if (current.dropTarget) {
          current.dropTarget.classList.remove("hh-touch-drop-target");
          dispatchDrag(current.dropTarget, "dragleave", current.dataTransfer, point);
        }
        current.dropTarget = next;
        if (next) {
          next.classList.add("hh-touch-drop-target");
          dispatchDrag(next, "dragenter", current.dataTransfer, point);
        }
      }
      return current.dropTarget;
    };

    const scheduleDropTargetSync = () => {
      if (!session?.dragging || session.syncFrame) return;
      const current = session;
      current.syncFrame = requestAnimationFrame(() => {
        if (session !== current) return;
        current.syncFrame = 0;
        updateDropTarget(current, current.latestPoint);
      });
    };

    const beginDrag = (current: DragSession, point: Point) => {
      const source = current.source;
      if (!source) return;
      clearInspectionHold(current);
      current.dragging = true;
      current.latestPoint = point;
      document.documentElement.classList.add("hh-touch-drag-active");
      document.body.dataset.hhTouchDragging = "true";
      source.classList.add("hh-touch-drag-source");
      source.setAttribute("aria-grabbed", "true");
      source.style.setProperty("pointer-events", "none", "important");
      dispatchDrag(source, "dragstart", current.dataTransfer, point);
      current.syncFrame = requestAnimationFrame(() => {
        if (session !== current || !current.dragging) return;
        current.syncFrame = 0;
        current.dropCandidates = collectDropCandidates(current.dataTransfer);
        updateDropTarget(current, current.latestPoint);
      });
      navigator.vibrate?.(8);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!coarsePointer(event) || !event.isPrimary || event.button > 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".screen-game")) return;

      const source = target.closest<HTMLElement>(DRAG_SOURCE_SELECTOR);
      const inspectCard = inspectableCardFrom(target);
      const sourceBlocked = source && (source.getAttribute("aria-disabled") === "true" || source.matches(":disabled"));
      if (sourceBlocked && !inspectCard) return;
      if (!source && !inspectCard) return;

      if (session) cleanup(session.latestPoint, true);
      const point = { x: event.clientX, y: event.clientY };
      session = {
        pointerId: event.pointerId,
        source: sourceBlocked ? null : source,
        inspectCard,
        startX: point.x,
        startY: point.y,
        startedAt: performance.now(),
        dragging: false,
        inspected: false,
        dataTransfer: new TouchDataTransfer(),
        dropCandidates: [],
        dropTarget: null,
        latestPoint: point,
        syncFrame: 0,
        captured: false,
        sourcePointerEvents: source?.style.getPropertyValue("pointer-events") || "",
        sourcePointerEventsPriority: source?.style.getPropertyPriority("pointer-events") || "",
        sourceAriaGrabbed: source?.getAttribute("aria-grabbed") ?? null,
        holdDelayTimer: 0,
        holdTimer: 0,
        holdProgress: null,
      };

      const captureTarget = source || inspectCard;
      try {
        captureTarget?.setPointerCapture(event.pointerId);
        session.captured = !!captureTarget?.hasPointerCapture(event.pointerId);
      } catch {
        session.captured = false;
      }
      beginInspectionHold(session);
      event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const current = session;
      const point = { x: event.clientX, y: event.clientY };
      current.latestPoint = point;
      const distance = Math.hypot(point.x - current.startX, point.y - current.startY);
      if (distance > HOLD_SLOP_PX) clearInspectionHold(current);
      if (!current.dragging && !current.inspected && current.source && distance >= DRAG_THRESHOLD_PX) beginDrag(current, point);
      if (!current.dragging) return;
      event.preventDefault();
      event.stopPropagation();
      scheduleDropTargetSync();
    };

    const onPointerUp = (event: PointerEvent) => {
      const upAt = performance.now();
      const point = { x: event.clientX, y: event.clientY };
      const current = session && event.pointerId === session.pointerId ? session : null;
      if (!current) return;

      if (current.dragging) {
        event.preventDefault();
        event.stopPropagation();
        current.latestPoint = point;
        suppressClicksUntil = upAt + 420;
        if (current.syncFrame) {
          cancelAnimationFrame(current.syncFrame);
          current.syncFrame = 0;
        }
        const target = updateDropTarget(current, point);
        if (target) {
          dispatchDrag(target, "dragover", current.dataTransfer, point);
          dispatchDrag(target, "drop", current.dataTransfer, point);
          navigator.vibrate?.(12);
        }
        cleanup(point, true);
        return;
      }

      const inspected = current.inspected;
      const duration = upAt - current.startedAt;
      const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      cleanup(point, false);
      if (inspected || moved > TAP_SLOP_PX || duration > TAP_MAX_DURATION_MS) {
        suppressClicksUntil = upAt + 360;
        return;
      }

      const control = controlFrom(event.target);
      if (!control || !control.isConnected) return;
      suppressClicksUntil = upAt + 360;
      control.click();
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      cleanup({ x: event.clientX, y: event.clientY }, true);
    };

    const onNativeDragStartCapture = (event: DragEvent) => {
      if (!session?.source || !event.isTrusted) return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || target !== session.source && !session.source.contains(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!event.isTrusted || performance.now() >= suppressClicksUntil) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".screen-game")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const cancelGesture = () => {
      if (!session) return;
      cleanup(session.latestPoint, true);
    };
    const onVisibilityChange = () => {
      if (document.hidden) cancelGesture();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
    window.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("dragstart", onNativeDragStartCapture, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("resize", cancelGesture, { passive: true });

    return () => {
      cancelGesture();
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("dragstart", onNativeDragStartCapture, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", cancelGesture);
    };
  }, []);

  return null;
}

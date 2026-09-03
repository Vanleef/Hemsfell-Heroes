"use client";

import { useEffect } from "react";

const DRAG_SOURCE_SELECTOR = ".screen-game [draggable='true']";
const DROP_ZONE_SELECTOR = ".screen-game .field-slot, .screen-game .terrain-slot";
const TAP_CONTROL_SELECTOR = [
  ".screen-game button:not(.original-card):not(:disabled)",
  ".screen-game .original-card:is(.target-ally,.target-enemy,.combat-attack-ready):not(:disabled)",
  ".screen-game [role='button']:not([aria-disabled='true'])",
].join(",");
const ASCENSION_TEXT_RE = /\bAscens(?:ão|ao)\s+\d+\s*:/i;
const DRAG_THRESHOLD_PX = 10;
const TAP_SLOP_PX = 10;
const TAP_FALLBACK_DELAY_MS = 220;
const TAP_MAX_DURATION_MS = 520;

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

type DragSession = {
  pointerId: number;
  source: HTMLElement;
  startX: number;
  startY: number;
  startedAt: number;
  dragging: boolean;
  dataTransfer: TouchDataTransfer;
  dropTarget: HTMLElement | null;
  latestPoint: Point;
  syncFrame: number;
  captured: boolean;
  sourcePointerEvents: string;
  sourcePointerEventsPriority: string;
  sourceAriaGrabbed: string | null;
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

function candidateDropZones(point: Point) {
  const seen = new Set<HTMLElement>();
  const zones: HTMLElement[] = [];
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    const zone = element.closest<HTMLElement>(DROP_ZONE_SELECTOR);
    if (!zone || seen.has(zone)) continue;
    seen.add(zone);
    zones.push(zone);
  }
  return zones;
}

function acceptedDropZone(point: Point, dataTransfer: TouchDataTransfer) {
  for (const zone of candidateDropZones(point)) {
    // React paints .can-drop after the synthetic dragstart updates the hand
    // drag state. When that render has not committed yet, ask the real
    // onDragOver handler whether it accepts the current DataTransfer instead.
    if (zone.classList.contains("can-drop")) return zone;
    const notCancelled = dispatchDrag(zone, "dragover", dataTransfer, point);
    if (!notCancelled) return zone;
  }
  return null;
}

function syncAscensionActivationUi() {
  document.querySelectorAll<HTMLElement>(".screen-game .card-frame").forEach((frame) => {
    const card = frame.querySelector<HTMLElement>(":scope > .original-card");
    const rulesText = card?.querySelector<HTMLElement>(":scope > .card-tooltip")?.textContent || "";
    const ascension = ASCENSION_TEXT_RE.test(rulesText);
    if (ascension) frame.setAttribute("data-hh-ascension", "true");
    else frame.removeAttribute("data-hh-ascension");
    const control = frame.querySelector<HTMLButtonElement>(":scope > .card-frame-activation");
    if (ascension && control) {
      control.hidden = true;
      control.disabled = true;
      control.setAttribute("aria-hidden", "true");
      control.tabIndex = -1;
    }
  });
}

export default function MobileTouchInputRuntime() {
  /* This runtime is mounted globally even though it owns mobile gestures. Use
     that stable mount to migrate legacy Ascensão UI in desktop and mobile: an
     automatic play keyword must never retain a stale activation button. */
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncAscensionActivationUi();
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let session: DragSession | null = null;
    let suppressClicksUntil = 0;
    let lastClickControl: HTMLElement | null = null;
    let lastClickAt = 0;
    let tapSequence = 0;

    const clearDropTarget = (point: Point) => {
      if (!session?.dropTarget) return;
      const previous = session.dropTarget;
      session.dropTarget = null;
      previous.classList.remove("hh-touch-drop-target");
      dispatchDrag(previous, "dragleave", session.dataTransfer, point);
    };

    const restoreSource = (current: DragSession) => {
      current.source.classList.remove("hh-touch-drag-source");
      if (current.sourcePointerEvents) {
        current.source.style.setProperty("pointer-events", current.sourcePointerEvents, current.sourcePointerEventsPriority);
      } else {
        current.source.style.removeProperty("pointer-events");
      }
      if (current.sourceAriaGrabbed == null) current.source.removeAttribute("aria-grabbed");
      else current.source.setAttribute("aria-grabbed", current.sourceAriaGrabbed);
      if (current.captured && current.source.hasPointerCapture?.(current.pointerId)) {
        try { current.source.releasePointerCapture(current.pointerId); } catch { /* pointer already released */ }
      }
    };

    const cleanup = (point: Point, emitDragEnd = true) => {
      if (!session) return;
      const current = session;
      session = null;
      if (current.syncFrame) cancelAnimationFrame(current.syncFrame);
      if (current.dropTarget) {
        current.dropTarget.classList.remove("hh-touch-drop-target");
        dispatchDrag(current.dropTarget, "dragleave", current.dataTransfer, point);
      }
      restoreSource(current);
      document.documentElement.classList.remove("hh-touch-drag-active");
      document.body.removeAttribute("data-hh-touch-dragging");
      if (emitDragEnd && current.dragging) dispatchDrag(current.source, "dragend", current.dataTransfer, point);
    };

    const updateDropTarget = (point: Point) => {
      if (!session?.dragging) return null;
      session.latestPoint = point;
      const next = acceptedDropZone(point, session.dataTransfer);
      if (next !== session.dropTarget) {
        clearDropTarget(point);
        if (next && session) {
          session.dropTarget = next;
          next.classList.add("hh-touch-drop-target");
          dispatchDrag(next, "dragenter", session.dataTransfer, point);
        }
      }
      if (session?.dropTarget) dispatchDrag(session.dropTarget, "dragover", session.dataTransfer, point);
      return session?.dropTarget ?? null;
    };

    const scheduleDropTargetSync = () => {
      if (!session?.dragging) return;
      if (session.syncFrame) cancelAnimationFrame(session.syncFrame);
      const current = session;
      current.syncFrame = requestAnimationFrame(() => {
        if (session !== current) return;
        current.syncFrame = 0;
        updateDropTarget(current.latestPoint);
      });
    };

    const beginDrag = (current: DragSession, point: Point) => {
      current.dragging = true;
      current.latestPoint = point;
      document.documentElement.classList.add("hh-touch-drag-active");
      document.body.dataset.hhTouchDragging = "true";
      current.source.classList.add("hh-touch-drag-source");
      current.source.setAttribute("aria-grabbed", "true");
      // Keep the captured pointer stream on the source, but remove the source
      // from hit-testing so cards/overlays cannot mask the board slot below it.
      current.source.style.setProperty("pointer-events", "none", "important");
      dispatchDrag(current.source, "dragstart", current.dataTransfer, point);
      scheduleDropTargetSync();
      navigator.vibrate?.(8);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!coarsePointer(event) || !event.isPrimary || event.button > 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".screen-game")) return;
      const source = target.closest<HTMLElement>(DRAG_SOURCE_SELECTOR);
      if (!source || source.getAttribute("aria-disabled") === "true" || source.matches(":disabled")) return;

      if (session) cleanup(session.latestPoint, true);
      const point = { x: event.clientX, y: event.clientY };
      session = {
        pointerId: event.pointerId,
        source,
        startX: point.x,
        startY: point.y,
        startedAt: performance.now(),
        dragging: false,
        dataTransfer: new TouchDataTransfer(),
        dropTarget: null,
        latestPoint: point,
        syncFrame: 0,
        captured: false,
        sourcePointerEvents: source.style.getPropertyValue("pointer-events"),
        sourcePointerEventsPriority: source.style.getPropertyPriority("pointer-events"),
        sourceAriaGrabbed: source.getAttribute("aria-grabbed"),
      };
      try {
        source.setPointerCapture(event.pointerId);
        session.captured = source.hasPointerCapture(event.pointerId);
      } catch {
        session.captured = false;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const point = { x: event.clientX, y: event.clientY };
      session.latestPoint = point;
      const distance = Math.hypot(point.x - session.startX, point.y - session.startY);
      if (!session.dragging && distance >= DRAG_THRESHOLD_PX) beginDrag(session, point);
      if (!session?.dragging) return;
      event.preventDefault();
      updateDropTarget(point);
    };

    const onPointerUp = (event: PointerEvent) => {
      const upAt = performance.now();
      const point = { x: event.clientX, y: event.clientY };
      const current = session && event.pointerId === session.pointerId ? session : null;
      if (current?.dragging) {
        event.preventDefault();
        current.latestPoint = point;
        suppressClicksUntil = upAt + 420;
        if (current.syncFrame) {
          cancelAnimationFrame(current.syncFrame);
          current.syncFrame = 0;
        }
        current.syncFrame = requestAnimationFrame(() => {
          if (session !== current) return;
          current.syncFrame = 0;
          const target = updateDropTarget(point);
          if (target) {
            dispatchDrag(target, "dragover", current.dataTransfer, point);
            dispatchDrag(target, "drop", current.dataTransfer, point);
            navigator.vibrate?.(12);
          }
          cleanup(point, true);
        });
        return;
      }

      if (current) cleanup(point, false);
      if (!coarsePointer(event)) return;
      const control = controlFrom(event.target);
      if (!control || !control.isConnected) return;
      const downX = current?.startX ?? event.clientX;
      const downY = current?.startY ?? event.clientY;
      const duration = current ? upAt - current.startedAt : 0;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > TAP_SLOP_PX || duration > TAP_MAX_DURATION_MS) return;
      const sequence = ++tapSequence;
      window.setTimeout(() => {
        if (sequence !== tapSequence || !control.isConnected) return;
        const nativeClickArrived = lastClickControl === control && lastClickAt >= upAt - 8;
        if (!nativeClickArrived) control.click();
      }, TAP_FALLBACK_DELAY_MS);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      cleanup({ x: event.clientX, y: event.clientY }, true);
    };

    // Chrome/Android may still attempt its own HTML5 drag for draggable=true.
    // While a coarse-pointer session is armed, our pointer bridge is the sole
    // drag authority; suppressing the trusted native drag avoids duplicate
    // dragstart/dragend sequences and pointercancel races.
    const onNativeDragStartCapture = (event: DragEvent) => {
      if (!session || !event.isTrusted) return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || target !== session.source && !session.source.contains(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onClickCapture = (event: MouseEvent) => {
      const control = controlFrom(event.target);
      if (control) {
        lastClickControl = control;
        lastClickAt = performance.now();
      }
      if (performance.now() >= suppressClicksUntil) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".screen-game")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onVisibilityChange = () => {
      if (!document.hidden || !session) return;
      cleanup(session.latestPoint, true);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("dragstart", onNativeDragStartCapture, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (session) cleanup(session.latestPoint, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("dragstart", onNativeDragStartCapture, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}

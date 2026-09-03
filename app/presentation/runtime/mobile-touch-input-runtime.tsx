"use client";

import { useEffect } from "react";

const DRAG_SOURCE_SELECTOR = ".screen-game [draggable='true']";
const DROP_TARGET_SELECTOR = ".screen-game .field-slot.can-drop, .screen-game .terrain-slot.can-drop";
const TAP_CONTROL_SELECTOR = [
  ".screen-game button:not(.original-card):not(:disabled)",
  ".screen-game .original-card:is(.target-ally,.target-enemy,.combat-attack-ready):not(:disabled)",
  ".screen-game [role='button']:not([aria-disabled='true'])",
].join(",");
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

type DragSession = {
  pointerId: number;
  source: HTMLElement;
  startX: number;
  startY: number;
  startedAt: number;
  dragging: boolean;
  dataTransfer: TouchDataTransfer;
  dropTarget: HTMLElement | null;
};

type Point = { x: number; y: number };

function coarsePointer(event: PointerEvent) {
  return event.pointerType === "touch" || event.pointerType === "pen" || window.matchMedia("(pointer: coarse)").matches;
}

function dragEvent(type: string, dataTransfer: TouchDataTransfer, point: Point) {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: point.x },
    clientY: { value: point.y },
  });
  return event;
}

function dispatchDrag(target: HTMLElement, type: string, dataTransfer: TouchDataTransfer, point: Point) {
  return target.dispatchEvent(dragEvent(type, dataTransfer, point));
}

function controlFrom(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(TAP_CONTROL_SELECTOR) : null;
}

function legalDropTarget(point: Point, source: HTMLElement) {
  source.classList.add("hh-touch-drag-source");
  const target = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>(DROP_TARGET_SELECTOR) ?? null;
  return target;
}

export default function MobileTouchInputRuntime() {
  useEffect(() => {
    let session: DragSession | null = null;
    let suppressClicksUntil = 0;
    let lastClickControl: HTMLElement | null = null;
    let lastClickAt = 0;
    let tapSequence = 0;

    const clearDropTarget = (point: Point) => {
      if (!session?.dropTarget) return;
      session.dropTarget.classList.remove("hh-touch-drop-target");
      dispatchDrag(session.dropTarget, "dragleave", session.dataTransfer, point);
      session.dropTarget = null;
    };

    const cleanup = (point: Point, emitDragEnd = true) => {
      if (!session) return;
      clearDropTarget(point);
      session.source.classList.remove("hh-touch-drag-source");
      document.documentElement.classList.remove("hh-touch-drag-active");
      document.body.removeAttribute("data-hh-touch-dragging");
      if (emitDragEnd && session.dragging) dispatchDrag(session.source, "dragend", session.dataTransfer, point);
      session = null;
    };

    const updateDropTarget = (point: Point) => {
      if (!session?.dragging) return null;
      const next = legalDropTarget(point, session.source);
      if (next !== session.dropTarget) {
        clearDropTarget(point);
        if (next) {
          session.dropTarget = next;
          next.classList.add("hh-touch-drop-target");
          dispatchDrag(next, "dragenter", session.dataTransfer, point);
        }
      }
      if (session.dropTarget) dispatchDrag(session.dropTarget, "dragover", session.dataTransfer, point);
      return session.dropTarget;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!coarsePointer(event) || !event.isPrimary || event.button > 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".screen-game")) return;
      const source = target.closest<HTMLElement>(DRAG_SOURCE_SELECTOR);
      if (!source) return;
      session = {
        pointerId: event.pointerId,
        source,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: performance.now(),
        dragging: false,
        dataTransfer: new TouchDataTransfer(),
        dropTarget: null,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const point = { x: event.clientX, y: event.clientY };
      const distance = Math.hypot(point.x - session.startX, point.y - session.startY);
      if (!session.dragging && distance >= DRAG_THRESHOLD_PX) {
        session.dragging = true;
        document.documentElement.classList.add("hh-touch-drag-active");
        document.body.dataset.hhTouchDragging = "true";
        session.source.classList.add("hh-touch-drag-source");
        dispatchDrag(session.source, "dragstart", session.dataTransfer, point);
        navigator.vibrate?.(8);
      }
      if (!session.dragging) return;
      event.preventDefault();
      updateDropTarget(point);
    };

    const onPointerUp = (event: PointerEvent) => {
      const upAt = performance.now();
      const point = { x: event.clientX, y: event.clientY };
      const current = session && event.pointerId === session.pointerId ? session : null;
      if (current?.dragging) {
        event.preventDefault();
        suppressClicksUntil = upAt + 420;
        const source = current.source;
        const dataTransfer = current.dataTransfer;
        requestAnimationFrame(() => {
          if (!session || session.source !== source) return;
          const target = updateDropTarget(point);
          if (target) {
            dispatchDrag(target, "dragover", dataTransfer, point);
            dispatchDrag(target, "drop", dataTransfer, point);
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
      cleanup({ x: session.startX, y: session.startY }, true);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (session) cleanup({ x: session.startX, y: session.startY }, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}

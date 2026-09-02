"use client";

import { useEffect } from "react";

const TRIGGER_SELECTOR = ".screen-game .hero-evolution";
const PORTAL_CLASS = "evolution-tooltip-portal";

export default function EvolutionTooltipPortalRuntime() {
  useEffect(() => {
    let portal: HTMLElement | null = null;
    let source: HTMLElement | null = null;
    let trigger: HTMLElement | null = null;
    let frame = 0;
    let touchPinned = false;

    const restoreSource = () => {
      if (!source) return;
      source.style.removeProperty("opacity");
      source.style.removeProperty("visibility");
      source.style.removeProperty("pointer-events");
    };

    const hide = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      portal?.remove();
      portal = null;
      restoreSource();
      source = null;
      trigger = null;
    };

    const place = () => {
      if (!portal || !trigger || !trigger.isConnected) {
        if (portal) hide();
        return;
      }
      const panel = trigger.closest<HTMLElement>(".hero-panel-stack.canonical-hero-panel");
      const panelRect = (panel ?? trigger).getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const margin = Math.max(8, Math.min(18, window.innerWidth * 0.008));

      portal.style.left = "0px";
      portal.style.top = "0px";
      const tooltipRect = portal.getBoundingClientRect();

      let left = panelRect.right + margin;
      if (left + tooltipRect.width > window.innerWidth - margin) {
        left = Math.max(margin, panelRect.left - margin - tooltipRect.width);
      }

      const localPlayer = panel?.classList.contains("player") ?? false;
      let top = localPlayer
        ? triggerRect.bottom - tooltipRect.height
        : triggerRect.top;
      top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

      portal.style.left = `${Math.round(left)}px`;
      portal.style.top = `${Math.round(top)}px`;
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    const show = (nextTrigger: HTMLElement) => {
      const nextSource = nextTrigger.querySelector<HTMLElement>(":scope > .evolution-tooltip");
      if (!nextSource) return;

      if (trigger === nextTrigger && portal) {
        if (source !== nextSource) {
          restoreSource();
          source = nextSource;
          portal.innerHTML = nextSource.innerHTML;
          nextSource.style.setProperty("opacity", "0", "important");
          nextSource.style.setProperty("visibility", "hidden", "important");
          nextSource.style.setProperty("pointer-events", "none", "important");
        }
        schedule();
        return;
      }

      hide();
      trigger = nextTrigger;
      source = nextSource;

      const nextPortal = document.createElement("div");
      nextPortal.className = `evolution-tooltip ${PORTAL_CLASS}`;
      nextPortal.setAttribute("role", "tooltip");
      nextPortal.setAttribute("aria-hidden", "false");
      nextPortal.innerHTML = nextSource.innerHTML;
      document.body.appendChild(nextPortal);
      portal = nextPortal;

      // The React-owned source remains available to assistive technology/state,
      // while the visible mirror lives directly under body and can never be
      // occluded by hand/card stacking contexts.
      nextSource.style.setProperty("opacity", "0", "important");
      nextSource.style.setProperty("visibility", "hidden", "important");
      nextSource.style.setProperty("pointer-events", "none", "important");
      schedule();
    };

    const triggerAtPoint = (clientX: number, clientY: number) => {
      const triggers = document.querySelectorAll<HTMLElement>(TRIGGER_SELECTOR);
      for (const candidate of triggers) {
        const rect = candidate.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) return candidate;
      }
      return null;
    };

    // Geometry-based hit testing is intentional. Some legacy hero rules use
    // pointer-events:none on progression wrappers, which makes event.target
    // based hover detection unreliable even though the progress bar is visible.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || touchPinned) return;
      const nextTrigger = triggerAtPoint(event.clientX, event.clientY);
      if (nextTrigger) show(nextTrigger);
      else if (trigger) hide();
    };

    const onPointerDown = (event: PointerEvent) => {
      const nextTrigger = triggerAtPoint(event.clientX, event.clientY);
      if (nextTrigger) {
        touchPinned = event.pointerType === "touch";
        show(nextTrigger);
        return;
      }
      touchPinned = false;
      if (trigger) hide();
    };

    const triggerFromEvent = (event: Event) =>
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(TRIGGER_SELECTOR)
        : null;

    const onFocusIn = (event: FocusEvent) => {
      const nextTrigger = triggerFromEvent(event);
      if (nextTrigger) show(nextTrigger);
    };

    const onFocusOut = (event: FocusEvent) => {
      const currentTrigger = triggerFromEvent(event);
      if (!currentTrigger || currentTrigger !== trigger || touchPinned) return;
      const related = event.relatedTarget;
      if (related instanceof Node && currentTrigger.contains(related)) return;
      hide();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        touchPinned = false;
        hide();
      }
    };

    const onWindowBlur = () => {
      touchPinned = false;
      hide();
    };

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true, capture: true });

    return () => {
      touchPinned = false;
      hide();
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, []);

  return null;
}

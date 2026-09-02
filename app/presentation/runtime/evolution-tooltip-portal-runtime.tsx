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
      if (!portal || !trigger) return;
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
      if (trigger === nextTrigger && portal) {
        schedule();
        return;
      }

      hide();
      const nextSource = nextTrigger.querySelector<HTMLElement>(":scope > .evolution-tooltip");
      if (!nextSource) return;

      trigger = nextTrigger;
      source = nextSource;

      const nextPortal = document.createElement("div");
      nextPortal.className = `evolution-tooltip ${PORTAL_CLASS}`;
      nextPortal.setAttribute("role", "tooltip");
      nextPortal.setAttribute("aria-hidden", "false");
      nextPortal.innerHTML = nextSource.innerHTML;
      document.body.appendChild(nextPortal);
      portal = nextPortal;

      // Keep the source in the React tree for semantics/state, but render only
      // the fixed body-level mirror while open so board stacking contexts can
      // never place cards in front of the criteria.
      nextSource.style.setProperty("opacity", "0", "important");
      nextSource.style.setProperty("visibility", "hidden", "important");
      nextSource.style.setProperty("pointer-events", "none", "important");
      schedule();
    };

    const triggerFromEvent = (event: Event) =>
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(TRIGGER_SELECTOR)
        : null;

    const onPointerOver = (event: PointerEvent) => {
      const nextTrigger = triggerFromEvent(event);
      if (!nextTrigger) return;
      const related = event.relatedTarget;
      if (related instanceof Node && nextTrigger.contains(related)) return;
      show(nextTrigger);
    };

    const onPointerOut = (event: PointerEvent) => {
      const currentTrigger = triggerFromEvent(event);
      if (!currentTrigger || currentTrigger !== trigger) return;
      const related = event.relatedTarget;
      if (related instanceof Node && currentTrigger.contains(related)) return;
      hide();
    };

    const onFocusIn = (event: FocusEvent) => {
      const nextTrigger = triggerFromEvent(event);
      if (nextTrigger) show(nextTrigger);
    };

    const onFocusOut = (event: FocusEvent) => {
      const currentTrigger = triggerFromEvent(event);
      if (!currentTrigger || currentTrigger !== trigger) return;
      const related = event.relatedTarget;
      if (related instanceof Node && currentTrigger.contains(related)) return;
      hide();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true, capture: true });

    return () => {
      hide();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, []);

  return null;
}

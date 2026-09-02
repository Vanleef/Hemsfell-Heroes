"use client";

import { useEffect } from "react";

const PROGRESS_SELECTOR = ".screen-game .hero-evolution > .evolution-track";
const EVOLUTION_SELECTOR = ".screen-game .hero-evolution";
const PORTAL_CLASS = "evolution-tooltip-portal";

export default function EvolutionTooltipPortalRuntime() {
  useEffect(() => {
    let portal: HTMLElement | null = null;
    let source: HTMLElement | null = null;
    let progressTrigger: HTMLElement | null = null;
    let frame = 0;
    let touchPinned = false;

    const hide = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      portal?.remove();
      portal = null;
      source = null;
      progressTrigger = null;
    };

    const evolutionRootFor = (progress: HTMLElement) =>
      progress.closest<HTMLElement>(EVOLUTION_SELECTOR);

    const place = () => {
      if (!portal || !progressTrigger || !progressTrigger.isConnected) {
        if (portal) hide();
        return;
      }

      const evolutionRoot = evolutionRootFor(progressTrigger);
      const panel = progressTrigger.closest<HTMLElement>(".hero-panel-stack.canonical-hero-panel");
      const panelRect = (panel ?? evolutionRoot ?? progressTrigger).getBoundingClientRect();
      const progressRect = progressTrigger.getBoundingClientRect();
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
        ? progressRect.bottom - tooltipRect.height
        : progressRect.top;
      top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

      portal.style.left = `${Math.round(left)}px`;
      portal.style.top = `${Math.round(top)}px`;
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    const show = (nextProgress: HTMLElement) => {
      const evolutionRoot = evolutionRootFor(nextProgress);
      const nextSource = evolutionRoot?.querySelector<HTMLElement>(":scope > .evolution-tooltip");
      if (!evolutionRoot || !nextSource) return;

      if (progressTrigger === nextProgress && portal) {
        if (source !== nextSource) {
          source = nextSource;
          portal.innerHTML = nextSource.innerHTML;
        }
        schedule();
        return;
      }

      hide();
      progressTrigger = nextProgress;
      source = nextSource;

      const nextPortal = document.createElement("div");
      nextPortal.className = `evolution-tooltip ${PORTAL_CLASS}`;
      nextPortal.setAttribute("role", "tooltip");
      nextPortal.setAttribute("aria-hidden", "false");
      nextPortal.innerHTML = nextSource.innerHTML;
      document.body.appendChild(nextPortal);
      portal = nextPortal;
      schedule();
    };

    const progressAtPoint = (clientX: number, clientY: number) => {
      const progressTracks = document.querySelectorAll<HTMLElement>(PROGRESS_SELECTOR);
      for (const candidate of progressTracks) {
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

    // The criteria tooltip is intentionally tied only to the visible progress
    // bar geometry. This avoids legacy pointer-events rules on hero wrappers and
    // prevents hovering unrelated parts of the hero panel from opening it.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || touchPinned) return;
      const nextProgress = progressAtPoint(event.clientX, event.clientY);
      if (nextProgress) show(nextProgress);
      else if (progressTrigger) hide();
    };

    const onPointerDown = (event: PointerEvent) => {
      const nextProgress = progressAtPoint(event.clientX, event.clientY);
      if (nextProgress) {
        touchPinned = event.pointerType === "touch";
        show(nextProgress);
        return;
      }
      touchPinned = false;
      if (progressTrigger) hide();
    };

    const progressFromFocusEvent = (event: Event) => {
      if (!(event.target instanceof Element)) return null;
      const evolutionRoot = event.target.closest<HTMLElement>(EVOLUTION_SELECTOR);
      return evolutionRoot?.querySelector<HTMLElement>(":scope > .evolution-track") ?? null;
    };

    const onFocusIn = (event: FocusEvent) => {
      const nextProgress = progressFromFocusEvent(event);
      if (nextProgress) show(nextProgress);
    };

    const onFocusOut = (event: FocusEvent) => {
      const currentProgress = progressFromFocusEvent(event);
      if (!currentProgress || currentProgress !== progressTrigger || touchPinned) return;
      const related = event.relatedTarget;
      const evolutionRoot = evolutionRootFor(currentProgress);
      if (related instanceof Node && evolutionRoot?.contains(related)) return;
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

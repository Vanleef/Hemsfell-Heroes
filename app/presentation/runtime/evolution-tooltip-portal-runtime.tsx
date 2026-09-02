"use client";

import { useEffect } from "react";

const PROGRESS_SURFACE_SELECTOR = ".screen-game .hero-evolution";
const SOURCE_SELECTOR = `${PROGRESS_SURFACE_SELECTOR} > .evolution-tooltip:not(.evolution-tooltip-portal)`;
const PORTAL_CLASS = "evolution-tooltip-portal";

type PopoverCapableElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

export default function EvolutionTooltipPortalRuntime() {
  useEffect(() => {
    let portal: PopoverCapableElement | null = null;
    let source: HTMLElement | null = null;
    let progressSurface: HTMLElement | null = null;
    let frame = 0;
    let secondFrame = 0;
    let touchPinned = false;

    const suppressReactOwnedTooltips = () => {
      document.querySelectorAll<HTMLElement>(SOURCE_SELECTOR).forEach((tooltip) => {
        tooltip.style.setProperty("display", "none", "important");
        tooltip.style.setProperty("opacity", "0", "important");
        tooltip.style.setProperty("visibility", "hidden", "important");
        tooltip.style.setProperty("pointer-events", "none", "important");
      });
    };

    const closePortal = (target: PopoverCapableElement | null) => {
      if (!target) return;
      try {
        target.hidePopover?.();
      } catch {
        // Older browsers use the fixed-position fallback below.
      }
      target.remove();
    };

    const hide = () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      frame = 0;
      secondFrame = 0;
      closePortal(portal);
      portal = null;
      source = null;
      progressSurface = null;
    };

    const place = () => {
      if (!portal || !progressSurface || !progressSurface.isConnected) {
        if (portal) hide();
        return;
      }

      const panel = progressSurface.closest<HTMLElement>(".hero-panel-stack.canonical-hero-panel");
      const panelRect = (panel ?? progressSurface).getBoundingClientRect();
      const progressRect = progressSurface.getBoundingClientRect();
      const viewportMargin = Math.max(8, Math.min(16, window.innerWidth * 0.0075));
      const sideGap = Math.max(8, Math.min(14, window.innerWidth * 0.006));

      // Reset using inline !important values so browser popover UA styles can
      // never pull the tooltip back to the top/center of the viewport.
      portal.style.setProperty("position", "fixed", "important");
      portal.style.setProperty("left", "0px", "important");
      portal.style.setProperty("top", "0px", "important");
      portal.style.setProperty("right", "auto", "important");
      portal.style.setProperty("bottom", "auto", "important");
      portal.style.setProperty("margin", "0", "important");

      const tooltipRect = portal.getBoundingClientRect();

      let left = panelRect.right + sideGap;
      if (left + tooltipRect.width > window.innerWidth - viewportMargin) {
        left = panelRect.left - sideGap - tooltipRect.width;
      }
      left = Math.max(
        viewportMargin,
        Math.min(left, window.innerWidth - tooltipRect.width - viewportMargin),
      );

      let top = progressRect.top + (progressRect.height - tooltipRect.height) / 2;
      top = Math.max(
        viewportMargin,
        Math.min(top, window.innerHeight - tooltipRect.height - viewportMargin),
      );

      portal.style.setProperty("left", `${Math.round(left)}px`, "important");
      portal.style.setProperty("top", `${Math.round(top)}px`, "important");
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      frame = requestAnimationFrame(() => {
        place();
        // Popover promotion can finish one frame after insertion on Chromium.
        // A second placement guarantees the final Top Layer box stays anchored
        // beside the hero panel rather than flashing at the viewport origin.
        secondFrame = requestAnimationFrame(place);
      });
    };

    const show = (nextSurface: HTMLElement) => {
      const nextSource = nextSurface.querySelector<HTMLElement>(":scope > .evolution-tooltip");
      if (!nextSource) return;

      suppressReactOwnedTooltips();

      if (progressSurface === nextSurface && portal) {
        if (source !== nextSource) {
          source = nextSource;
          portal.innerHTML = nextSource.innerHTML;
        }
        schedule();
        return;
      }

      hide();
      progressSurface = nextSurface;
      source = nextSource;

      const nextPortal = document.createElement("div") as PopoverCapableElement;
      nextPortal.className = `ui-tooltip-portal evolution-tooltip ${PORTAL_CLASS}`;
      nextPortal.setAttribute("role", "tooltip");
      nextPortal.setAttribute("aria-hidden", "false");
      nextPortal.setAttribute("popover", "manual");
      nextPortal.innerHTML = nextSource.innerHTML;
      document.body.appendChild(nextPortal);
      portal = nextPortal;

      // Native Popover puts the criteria in the browser Top Layer, above every
      // board, hand, modal and transformed stacking context. CSS fixed-position
      // rules remain as a fallback when Popover is unavailable.
      try {
        nextPortal.showPopover?.();
      } catch {
        // Safe fixed-position fallback.
      }
      schedule();
    };

    const surfaceFromEvent = (event: Event) =>
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(PROGRESS_SURFACE_SELECTOR)
        : null;

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch" || touchPinned) return;
      const nextSurface = surfaceFromEvent(event);
      if (!nextSurface) return;
      if (event.relatedTarget instanceof Node && nextSurface.contains(event.relatedTarget)) return;
      show(nextSurface);
    };

    const onPointerOut = (event: PointerEvent) => {
      if (touchPinned) return;
      const currentSurface = surfaceFromEvent(event);
      if (!currentSurface || currentSurface !== progressSurface) return;
      if (event.relatedTarget instanceof Node && currentSurface.contains(event.relatedTarget)) return;
      hide();
    };

    const onPointerDown = (event: PointerEvent) => {
      const nextSurface = surfaceFromEvent(event);
      if (nextSurface) {
        touchPinned = event.pointerType === "touch";
        show(nextSurface);
        return;
      }
      touchPinned = false;
      if (progressSurface) hide();
    };

    const onFocusIn = (event: FocusEvent) => {
      const nextSurface = surfaceFromEvent(event);
      if (nextSurface) show(nextSurface);
    };

    const onFocusOut = (event: FocusEvent) => {
      const currentSurface = surfaceFromEvent(event);
      if (!currentSurface || currentSurface !== progressSurface || touchPinned) return;
      const related = event.relatedTarget;
      if (related instanceof Node && currentSurface.contains(related)) return;
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

    const sourceObserver = new MutationObserver(suppressReactOwnedTooltips);
    sourceObserver.observe(document.body, { childList: true, subtree: true });
    suppressReactOwnedTooltips();

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
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
      sourceObserver.disconnect();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
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

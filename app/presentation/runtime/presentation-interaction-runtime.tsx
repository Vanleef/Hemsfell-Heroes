"use client";

import { useEffect } from "react";

type PresentationWindow = Window & {
  __hemsfellPresentationBusy?: boolean;
};

const PRESENTATION_EVENTS = [
  "hemsfell:presentation-busy",
  "hemsfell:presentation-idle",
];
const BLOCKED_EVENTS = ["pointerdown", "click", "dblclick", "contextmenu", "dragstart", "drop", "keydown"] as const;
const DEFERRED_RESPONSE_SELECTOR = ".screen-game .response-overlay,.screen-game .response-waiting";

const locked = () => {
  const presentationWindow = window as PresentationWindow;
  return !!presentationWindow.__hemsfellPresentationBusy;
};

export default function PresentationInteractionRuntime() {
  useEffect(() => {
    const syncDeferredResponseUi = (active: boolean) => {
      document.querySelectorAll<HTMLElement>(DEFERRED_RESPONSE_SELECTOR).forEach((node) => {
        if (active) {
          node.dataset.hhDeferredByPresentation = "true";
          node.hidden = true;
          node.setAttribute("aria-hidden", "true");
          return;
        }
        if (node.dataset.hhDeferredByPresentation !== "true") return;
        delete node.dataset.hhDeferredByPresentation;
        node.hidden = false;
        node.removeAttribute("aria-hidden");
      });
    };

    const apply = () => {
      const active = locked();
      document.documentElement.classList.toggle("hh-presentation-locked", active);
      document.querySelectorAll<HTMLElement>(".screen-game").forEach((screen) => {
        if (active) {
          screen.dataset.presentationBusy = "true";
          screen.setAttribute("aria-busy", "true");
        } else {
          screen.removeAttribute("data-presentation-busy");
          screen.removeAttribute("aria-busy");
        }
      });
      /* Priority belongs to the resolved action, but its dialog belongs after
         the source card has visually arrived. React may already contain the
         pendingResponse while presentation is running, so keep that UI
         explicitly deferred until the canonical idle event. */
      syncDeferredResponseUi(active);
    };

    const guard = (event: Event) => {
      if (!locked()) return;
      const target = event.target instanceof Element ? event.target : null;
      const insideGame = !!target?.closest(".screen-game") || event instanceof KeyboardEvent && !!document.querySelector(".screen-game");
      if (!insideGame) return;
      if (target?.closest(".hh-motion-layer,.hh-effect-layer")) return;
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    };

    PRESENTATION_EVENTS.forEach((eventName) => window.addEventListener(eventName, apply));
    BLOCKED_EVENTS.forEach((eventName) => document.addEventListener(eventName, guard, true));
    apply();

    const observer = new MutationObserver(() => {
      if (locked()) apply();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      PRESENTATION_EVENTS.forEach((eventName) => window.removeEventListener(eventName, apply));
      BLOCKED_EVENTS.forEach((eventName) => document.removeEventListener(eventName, guard, true));
      document.documentElement.classList.remove("hh-presentation-locked");
      syncDeferredResponseUi(false);
      document.querySelectorAll<HTMLElement>(".screen-game").forEach((screen) => {
        screen.removeAttribute("data-presentation-busy");
        screen.removeAttribute("aria-busy");
      });
    };
  }, []);

  return null;
}

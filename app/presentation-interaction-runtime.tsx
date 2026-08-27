"use client";

import { useEffect } from "react";

type PresentationWindow = Window & {
  __hemsfellPresentationBusy?: boolean;
  __hemsfellPresentationCueBusy?: boolean;
};

const PRESENTATION_EVENTS = [
  "hemsfell:presentation-busy",
  "hemsfell:presentation-idle",
  "hemsfell:presentation-cue-busy",
  "hemsfell:presentation-cue-idle",
];
const BLOCKED_EVENTS = ["pointerdown", "click", "dblclick", "contextmenu", "dragstart", "drop", "keydown"] as const;

const locked = () => {
  const presentationWindow = window as PresentationWindow;
  return !!(presentationWindow.__hemsfellPresentationBusy || presentationWindow.__hemsfellPresentationCueBusy);
};

export default function PresentationInteractionRuntime() {
  useEffect(() => {
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
    };

    const guard = (event: Event) => {
      if (!locked()) return;
      const target = event.target instanceof Element ? event.target : null;
      const insideGame = !!target?.closest(".screen-game") || event instanceof KeyboardEvent && !!document.querySelector(".screen-game");
      if (!insideGame) return;
      if (target?.closest(".hh-motion-layer,.hh-effect-layer,.hh-action-cue-layer")) return;
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
      document.querySelectorAll<HTMLElement>(".screen-game").forEach((screen) => {
        screen.removeAttribute("data-presentation-busy");
        screen.removeAttribute("aria-busy");
      });
    };
  }, []);

  return null;
}

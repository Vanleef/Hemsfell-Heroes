"use client";

import { useEffect } from "react";

type PresentationWindow = Window & { __hemsfellPresentationBusy?: boolean };

const BUSY_EVENT = "hemsfell:presentation-busy";
const IDLE_EVENT = "hemsfell:presentation-idle";
const CATCH_UP_EVENT = "hemsfell:presentation-catch-up";
const MAX_PRESENTATION_LOCK_MS = 5600;

/**
 * The page intentionally refuses to advance bot decisions while presentation is
 * busy. That means a stale presentation flag cannot rely on the AI itself to
 * recover: the AI callback is never entered. This match-only watchdog asks the
 * canonical presentation runtime to snap to authoritative state if a visual
 * transaction exceeds its liveness budget.
 */
export default function PresentationLivenessRuntime() {
  useEffect(() => {
    const presentationWindow = window as PresentationWindow;
    let timer = 0;
    let generation = 0;

    const cancel = () => {
      generation += 1;
      if (timer) window.clearTimeout(timer);
      timer = 0;
    };

    const arm = () => {
      cancel();
      if (!presentationWindow.__hemsfellPresentationBusy || document.visibilityState === "hidden") return;
      const expectedGeneration = generation;
      timer = window.setTimeout(() => {
        timer = 0;
        if (expectedGeneration !== generation || !presentationWindow.__hemsfellPresentationBusy) return;
        window.dispatchEvent(new CustomEvent(CATCH_UP_EVENT, {
          detail: { reason: "presentation-liveness-timeout", maxMs: MAX_PRESENTATION_LOCK_MS },
        }));
      }, MAX_PRESENTATION_LOCK_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") cancel();
      else if (presentationWindow.__hemsfellPresentationBusy) arm();
    };

    window.addEventListener(BUSY_EVENT, arm);
    window.addEventListener(IDLE_EVENT, cancel);
    document.addEventListener("visibilitychange", onVisibility);
    if (presentationWindow.__hemsfellPresentationBusy) arm();

    return () => {
      cancel();
      window.removeEventListener(BUSY_EVENT, arm);
      window.removeEventListener(IDLE_EVENT, cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}

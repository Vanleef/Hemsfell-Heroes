"use client";

import { useEffect } from "react";

type PhasePresentation = {
  current: string;
  next: string;
  icon: string;
};

/* The existing React button copy describes the action. This runtime derives
 * the current/next phase without changing rules or command handling. */
const PHASE_PRESENTATION: Array<[RegExp, PhasePresentation]> = [
  [/^principal$/i, { current: "MANUTENÇÃO", next: "PRINCIPAL", icon: "◆" }],
  [/^combate$/i, { current: "PRINCIPAL", next: "COMBATE", icon: "⚔" }],
  [/^encerrar combate$/i, { current: "COMBATE", next: "FINALIZAÇÃO", icon: "✦" }],
  [/^encerrar turno$/i, { current: "FINALIZAÇÃO", next: "ENCERRAR TURNO", icon: "✓" }],
];

function cleanButtonCopy(button: HTMLButtonElement) {
  return (button.textContent || "")
    .replace(/→/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function presentationFor(button: HTMLButtonElement): PhasePresentation {
  const copy = cleanButtonCopy(button);
  const found = PHASE_PRESENTATION.find(([pattern]) => pattern.test(copy));
  if (found) return found[1];
  return { current: "FASE ATUAL", next: copy.toUpperCase() || "AVANÇAR", icon: "›" };
}

function syncPhaseAdvanceUi() {
  document.querySelectorAll<HTMLElement>(".screen-game .phase-orb").forEach((orb) => {
    const button = orb.querySelector<HTMLButtonElement>(":scope > button");
    if (!button) {
      orb.dataset.phaseState = "opponent";
      delete orb.dataset.currentPhase;
      delete orb.dataset.nextPhase;
      return;
    }

    const presentation = presentationFor(button);
    orb.dataset.phaseState = button.disabled ? "blocked" : "ready";
    orb.dataset.currentPhase = presentation.current;
    orb.dataset.nextPhase = presentation.next;

    button.dataset.currentPhase = presentation.current;
    button.dataset.nextPhase = presentation.next;
    button.dataset.phaseIcon = presentation.icon;
    button.dataset.phaseReady = button.disabled ? "false" : "true";
    button.setAttribute("aria-label", `${presentation.current}. Avançar para ${presentation.next}.`);
  });
}

export default function PhaseAdvanceRuntime() {
  useEffect(() => {
    let frame = 0;
    const scheduleSync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncPhaseAdvanceUi);
    };

    scheduleSync();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "class"],
    });

    window.addEventListener("resize", scheduleSync, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleSync);
    };
  }, []);

  return null;
}

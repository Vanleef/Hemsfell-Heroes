"use client";

import { useEffect } from "react";

type PhaseAction = {
  current: string;
  next: string;
  icon: string;
  aria: string;
};

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
}

function resolvePhaseAction(button: HTMLButtonElement): PhaseAction {
  const label = normalizeLabel(button.textContent || "");

  if (label.includes("encerrar combate")) {
    return {
      current: "COMBATE",
      next: "FINALIZAÇÃO",
      icon: "◆",
      aria: "Avançar para a fase de Finalização",
    };
  }

  if (label.includes("encerrar turno")) {
    return {
      current: "FINALIZAÇÃO",
      next: "ENCERRAR TURNO",
      icon: "↻",
      aria: "Encerrar o turno",
    };
  }

  if (label.includes("combate")) {
    return {
      current: "PRINCIPAL",
      next: "COMBATE",
      icon: "⚔",
      aria: "Avançar para a fase de Combate",
    };
  }

  if (label.includes("principal")) {
    return {
      current: "MANUTENÇÃO",
      next: "PRINCIPAL",
      icon: "✦",
      aria: "Avançar para a fase Principal",
    };
  }

  const fallback = (button.textContent || "AVANÇAR").replace(/\s*→\s*$/, "").trim().toLocaleUpperCase("pt-BR");
  return {
    current: "FASE ATUAL",
    next: fallback || "AVANÇAR",
    icon: "◆",
    aria: fallback ? `Avançar: ${fallback}` : "Avançar fase",
  };
}

function syncPhaseAction() {
  const orb = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board > .phase-orb");
  if (!orb) return;

  const button = orb.querySelector<HTMLButtonElement>(":scope > button");
  if (!button) {
    delete orb.dataset.phaseCurrent;
    return;
  }

  const action = resolvePhaseAction(button);
  orb.dataset.phaseCurrent = action.current;
  button.dataset.phaseNext = action.next;
  button.dataset.phaseIcon = action.icon;
  button.setAttribute("aria-label", action.aria);
}

/**
 * Adds semantic phase metadata without changing React-owned button text or
 * gameplay handlers. CSS consumes these data attributes to render the premium
 * contextual CTA while the underlying command flow remains untouched.
 */
export default function PhaseActionRuntime() {
  useEffect(() => {
    syncPhaseAction();

    const observer = new MutationObserver(() => syncPhaseAction());
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}

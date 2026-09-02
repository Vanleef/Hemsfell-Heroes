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

function visibleCurrentPhase() {
  return document
    .querySelector<HTMLElement>(".screen-game .phase-track > .active span")
    ?.textContent
    ?.trim()
    .toLocaleUpperCase("pt-BR") || "";
}

function isLocalTurn() {
  return normalizeLabel(document.querySelector<HTMLElement>(".screen-game .turn-owner > b")?.textContent || "") === "seu turno";
}

function removeCurrentPhaseCopy(orb: HTMLElement) {
  orb.querySelector<HTMLElement>(":scope > .phase-current-copy")?.remove();
}

/**
 * Presentation-only hierarchy for the local player's phase action.
 * React still owns the actual button and its gameplay handler; this wrapper
 * only makes "FASE ATUAL" and the phase name independently styleable.
 */
function syncCurrentPhaseCopy(orb: HTMLElement, button: HTMLButtonElement, current: string) {
  let copy = orb.querySelector<HTMLElement>(":scope > .phase-current-copy");

  if (!copy) {
    copy = document.createElement("div");
    copy.className = "phase-current-copy";
    copy.setAttribute("aria-hidden", "true");

    const kicker = document.createElement("span");
    kicker.className = "phase-current-kicker";
    kicker.textContent = "FASE ATUAL";

    const name = document.createElement("strong");
    name.className = "phase-current-name";

    copy.append(kicker, name);
    orb.insertBefore(copy, button);
  }

  const name = copy.querySelector<HTMLElement>(":scope > .phase-current-name");
  if (name && name.textContent !== current) name.textContent = current;
}

function syncPhaseAction() {
  const orb = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board > .phase-orb");
  if (!orb) return;

  const trackedPhase = visibleCurrentPhase();
  const localTurn = isLocalTurn();
  orb.dataset.localTurn = localTurn ? "true" : "false";

  const button = orb.querySelector<HTMLButtonElement>(":scope > button");
  if (!button) {
    removeCurrentPhaseCopy(orb);
    orb.dataset.phaseCurrent = trackedPhase;
    orb.dataset.phaseEmpty = localTurn
      ? trackedPhase === "MANUTENÇÃO"
        ? "MANUTENÇÃO"
        : trackedPhase || "AGUARDE"
      : "TURNO DO OPONENTE";
    return;
  }

  delete orb.dataset.phaseEmpty;
  const action = resolvePhaseAction(button);
  const current = trackedPhase || action.current;
  orb.dataset.phaseCurrent = current;
  syncCurrentPhaseCopy(orb, button, current);
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

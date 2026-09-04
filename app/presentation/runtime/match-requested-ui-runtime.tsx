"use client";

import { useEffect } from "react";

const MAX_HERO_LEVEL = 3;
const HERO_PROGRESS_LABELS: Record<string, string> = {
  "Gimble": "Dragões em campo",
  "Sr. Goblin": "Cartas neste turno",
  "Uruk": "Feitiços conjurados",
  "Tifon": "Mortes aliadas",
  "Saymon": "Perdas de vida",
  "Tessália": "Ataques do Comandante",
  "Quarion": "Criaturas aliadas únicas",
  "Rasmus": "Gatos",
  "Ngoro": "Pistas",
  "Zayan": "Constantes",
  "Campeão de Natureza": "Marcadores",
};

/**
 * Owns requested HUD copy/position corrections only. Card-local status and
 * action icons deliberately stay out of presentation flights: an animated card
 * is represented by its face alone and its stable live frame restores icons
 * after the ordered presentation transaction finishes.
 */
export default function MatchRequestedUiRuntime() {
  useEffect(() => {
    let frame = 0;

    const syncEvolutionCopy = () => {
      document.querySelectorAll<HTMLElement>(".hh-hero-level-up b").forEach((label) => {
        const current = label.textContent || "";
        const next = current.replace(/ASCENSÃO/gi, (value) => value === value.toLowerCase() ? "evolução" : "EVOLUÇÃO");
        if (current !== next) label.textContent = next;
      });
    };

    const syncHeroProgressCopy = () => {
      document.querySelectorAll<HTMLElement>(".screen-game .hero-panel-stack.canonical-hero-panel").forEach((panel) => {
        const levelText = panel.querySelector<HTMLElement>(".hero-level")?.textContent || "";
        const heroLevel = Number.parseInt(levelText.match(/\d+/)?.[0] || "0", 10);
        const evolution = panel.querySelector<HTMLElement>(".hero-evolution");
        const evolveButton = panel.querySelector<HTMLButtonElement>(".level-button");
        const atMaxLevel = heroLevel >= MAX_HERO_LEVEL;

        if (atMaxLevel) {
          panel.dataset.hhMaxLevel = "true";
          [evolution, evolveButton].forEach((control) => {
            if (!control) return;
            control.hidden = true;
            control.setAttribute("aria-hidden", "true");
            control.style.setProperty("display", "none", "important");
          });
          return;
        }

        delete panel.dataset.hhMaxLevel;
        [evolution, evolveButton].forEach((control) => {
          if (!control) return;
          control.hidden = false;
          control.removeAttribute("aria-hidden");
          control.style.removeProperty("display");
        });

        const heroName = panel.querySelector<HTMLElement>(".hero-short-name")?.textContent?.trim() || "";
        const label = HERO_PROGRESS_LABELS[heroName];
        const copy = evolution?.querySelector<HTMLElement>(".hero-evolution-copy") || null;
        const small = copy?.querySelector<HTMLElement>(":scope > small") || null;
        const strong = copy?.querySelector<HTMLElement>(":scope > strong") || null;
        if (!label || !copy || !small || !strong) return;

        const counter = (strong.textContent || "").trim();
        const next = `${counter} ${label}`.trim();
        if (small.textContent !== next) small.textContent = next;
        if (!strong.hidden) strong.hidden = true;
        if (copy.dataset.hhShortProgress !== "true") copy.dataset.hhShortProgress = "true";
        if (copy.getAttribute("aria-label") !== next) copy.setAttribute("aria-label", next);
      });
    };

    const syncPriorityPair = () => {
      const ai = document.querySelector<HTMLElement>("[data-hemsfell-ai-thinking]");
      const stack = document.querySelector<HTMLElement>(".screen-game .priority-stack-indicator");
      if (!ai || !stack || !stack.isConnected || stack.getClientRects().length === 0) {
        if (ai) {
          delete ai.dataset.hhPriorityPaired;
          ai.style.removeProperty("--hh-ai-paired-left");
          ai.style.removeProperty("--hh-ai-paired-top");
        }
        return;
      }

      const stackRect = stack.getBoundingClientRect();
      const aiRect = ai.getBoundingClientRect();
      if (stackRect.width <= 0 || stackRect.height <= 0 || aiRect.width <= 0 || aiRect.height <= 0) return;
      const gap = Math.max(8, Math.min(14, window.innerWidth * 0.008));
      const rightCandidate = stackRect.right + gap;
      const leftCandidate = stackRect.left - gap - aiRect.width;
      const left = rightCandidate + aiRect.width <= window.innerWidth - 8
        ? rightCandidate
        : Math.max(8, leftCandidate);
      const top = Math.max(8, Math.min(window.innerHeight - aiRect.height - 8, stackRect.top + (stackRect.height - aiRect.height) / 2));
      ai.style.setProperty("--hh-ai-paired-left", `${left}px`);
      ai.style.setProperty("--hh-ai-paired-top", `${top}px`);
      ai.dataset.hhPriorityPaired = "true";
    };

    const sync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncEvolutionCopy();
        syncHeroProgressCopy();
        syncPriorityPair();
      });
    };

    syncEvolutionCopy();
    syncHeroProgressCopy();
    syncPriorityPair();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const onPresentationAction = () => sync();
    const onResize = () => syncPriorityPair();
    window.addEventListener("hemsfell:presentation-action", onPresentationAction, true);
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("hemsfell:presentation-action", onPresentationAction, true);
      window.removeEventListener("resize", onResize);
      const ai = document.querySelector<HTMLElement>("[data-hemsfell-ai-thinking]");
      if (ai) {
        delete ai.dataset.hhPriorityPaired;
        ai.style.removeProperty("--hh-ai-paired-left");
        ai.style.removeProperty("--hh-ai-paired-top");
      }
    };
  }, []);

  return null;
}

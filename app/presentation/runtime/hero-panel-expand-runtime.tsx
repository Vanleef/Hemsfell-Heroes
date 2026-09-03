"use client";

import { useEffect } from "react";

const PANEL_SELECTOR = ".screen-game .game-stage > .game-content.hs-board > .hero-panel-stack.canonical-hero-panel";
const TRIGGER_SELECTOR = ".hero-power-trigger";

const isHeroTargeting = (panel: Element) => {
  const hero = panel.querySelector(".player-hero");
  return !!hero && (hero.classList.contains("target-ally") || hero.classList.contains("target-enemy"));
};

const syncLevelBadge = (panel: Element, trigger: HTMLElement) => {
  const semanticLevel = panel.querySelector<HTMLElement>(".hero-level")?.textContent ?? "";
  const level = semanticLevel.match(/\d+/)?.[0];
  if (level) trigger.setAttribute("data-hero-level", `Nv. ${level}`);
  else trigger.removeAttribute("data-hero-level");
};

const syncAbilityInteractivity = (panel: Element) => {
  for (const ability of panel.querySelectorAll<HTMLButtonElement>("button.hero-ability-chip")) {
    /* The render contract already exposes whether an ability is actionable via
       aria-disabled. Mirror that state to the native button so passive, locked
       and unavailable powers cannot dispatch click/keyboard activation while
       their CSS hover tooltip remains available. */
    const disabled = ability.getAttribute("aria-disabled") === "true" || ability.classList.contains("is-passive");
    ability.disabled = disabled;
    ability.tabIndex = disabled ? -1 : 0;
  }
};

const syncExpandedState = (panel: Element, expanded: boolean) => {
  panel.classList.toggle("is-expanded", expanded);
  const trigger = panel.querySelector<HTMLElement>(TRIGGER_SELECTOR);
  trigger?.setAttribute("aria-expanded", expanded ? "true" : "false");
  trigger?.setAttribute("aria-label", expanded ? "Recolher detalhes do herói" : "Expandir detalhes do herói");
};

export default function HeroPanelExpandRuntime() {
  useEffect(() => {
    const panels = () => Array.from(document.querySelectorAll(PANEL_SELECTOR));

    const initialize = () => {
      for (const panel of panels()) {
        const trigger = panel.querySelector<HTMLElement>(TRIGGER_SELECTOR);
        if (trigger) {
          trigger.setAttribute("aria-expanded", panel.classList.contains("is-expanded") ? "true" : "false");
          trigger.setAttribute("aria-label", panel.classList.contains("is-expanded") ? "Recolher detalhes do herói" : "Expandir detalhes do herói");
          syncLevelBadge(panel, trigger);
        }
        syncAbilityInteractivity(panel);
      }
    };

    const closeAll = (except?: Element | null) => {
      for (const panel of panels()) {
        if (panel === except) continue;
        if (panel.classList.contains("is-expanded")) syncExpandedState(panel, false);
      }
    };

    const togglePanel = (panel: Element) => {
      const next = !panel.classList.contains("is-expanded");
      closeAll(panel);
      syncExpandedState(panel, next);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const panel = target.closest(PANEL_SELECTOR);
      if (!panel) {
        closeAll();
        return;
      }

      const trigger = target.closest(TRIGGER_SELECTOR);
      if (!trigger || isHeroTargeting(panel) || event.button !== 0) return;

      /* The portrait used to open the generic card inspector. It now owns the
         requested compact/expanded hero interaction instead. */
      event.preventDefault();
      event.stopPropagation();
      togglePanel(panel);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAll();
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target instanceof Element ? event.target : null;
      const trigger = target?.closest(TRIGGER_SELECTOR);
      const panel = trigger?.closest(PANEL_SELECTOR);
      if (!trigger || !panel || isHeroTargeting(panel)) return;

      event.preventDefault();
      event.stopPropagation();
      togglePanel(panel);
    };

    initialize();
    const observer = new MutationObserver(initialize);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return null;
}

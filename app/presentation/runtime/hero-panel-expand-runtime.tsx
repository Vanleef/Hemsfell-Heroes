"use client";

import { useEffect } from "react";

const PANEL_SELECTOR = ".screen-game .game-stage > .game-content.hs-board > .hero-panel-stack.canonical-hero-panel";

const syncLevelBadge = (panel: Element, trigger: HTMLElement) => {
  const semanticLevel = panel.querySelector<HTMLElement>(".hero-level")?.textContent ?? "";
  const level = semanticLevel.match(/\d+/)?.[0];
  if (level) trigger.setAttribute("data-hero-level", `Nv. ${level}`);
  else trigger.removeAttribute("data-hero-level");
};

const syncAbilityInteractivity = (panel: Element) => {
  const owned = panel.classList.contains("player") && !panel.classList.contains("enemy");
  for (const ability of panel.querySelectorAll<HTMLButtonElement>("button.hero-ability-chip")) {
    /* Only learned active powers from the local hero may keep native button
       semantics. Temporary gameplay availability remains React-owned, so we do
       not mirror transient aria-disabled states into disabled and risk leaving
       a learned power stuck after priority/turn state changes. */
    const passive = ability.classList.contains("is-passive") || ability.classList.contains("passive");
    const locked = ability.classList.contains("is-locked") || ability.classList.contains("locked");
    const informational = !owned || passive || locked;
    ability.disabled = informational;
    ability.tabIndex = informational ? -1 : 0;
    ability.dataset.hhAbilityClickable = informational ? "false" : "true";
  }
};

/** Compact HUD metadata only. Portrait interaction belongs to React. */
export default function HeroPanelExpandRuntime() {
  useEffect(() => {
    const initialize = () => {
      for (const panel of document.querySelectorAll(PANEL_SELECTOR)) {
        if (panel.classList.contains("is-expanded")) panel.classList.remove("is-expanded");
        const trigger = panel.querySelector<HTMLElement>(".hero-power-trigger");
        if (trigger) syncLevelBadge(panel, trigger);
        syncAbilityInteractivity(panel);
      }
    };
    initialize();
    const observer = new MutationObserver(initialize);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["class", "aria-disabled"] });
    return () => observer.disconnect();
  }, []);
  return null;
}

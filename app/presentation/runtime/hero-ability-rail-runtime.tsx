"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type AbilityIcon = {
  source: HTMLButtonElement;
  slot: number;
  glyph: string;
  tooltip: string;
  active: boolean;
  available: boolean;
  locked: boolean;
  passive: boolean;
};

const PANEL_SELECTOR = ".screen-game .hero-panel-stack.canonical-hero-panel";
const CHIP_SELECTOR = ".hero-command-bar .hero-ability-chip";

function glyphForAbility(copy: string, slot: number) {
  const text = copy.toLocaleLowerCase("pt-BR");
  if (/roubo de vida|\bcure\b|\bvida\b/.test(text)) return "♥";
  if (/desvire|\bvire\b/.test(text)) return "↻";
  if (/dano|cause|destru|morrer|morte|último suspiro/.test(text)) return "✹";
  if (/investig|pista/.test(text)) return "⌕";
  if (/furtivo/.test(text)) return "◌";
  if (/marcador/.test(text)) return "●";
  if (/comandante|atac|combate|ofensividade/.test(text)) return "⚔";
  if (/primeiro ato/.test(text)) return "Ⅰ";
  if (/gato|café/.test(text)) return "☕";
  if (/dragão/.test(text)) return "◇";
  if (/goblin|custo|custa/.test(text)) return "¤";
  if (/feitiço|elemento|magia/.test(text)) return "◆";
  if (/compre|carta/.test(text)) return "✦";
  return ["✦", "◆", "✧"][slot] ?? "✦";
}

function readAbilities(panel: HTMLElement): AbilityIcon[] {
  return Array.from(panel.querySelectorAll<HTMLButtonElement>(CHIP_SELECTOR)).slice(0, 3).map((source, slot) => {
    const copy = source.dataset.abilityTooltip || source.getAttribute("aria-label") || source.textContent || `Habilidade ${slot + 1}`;
    const active = source.classList.contains("is-active");
    const locked = source.classList.contains("is-locked");
    const available = active && source.classList.contains("is-available") && source.getAttribute("aria-disabled") !== "true";
    return {
      source,
      slot,
      glyph: glyphForAbility(copy, slot),
      tooltip: copy.trim(),
      active,
      available,
      locked,
      passive: !active,
    };
  });
}

function HeroAbilityRail({ panel }: { panel: HTMLElement }) {
  const [abilities, setAbilities] = useState<AbilityIcon[]>(() => readAbilities(panel));
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const hero = panel.querySelector<HTMLElement>(":scope > .player-hero");

  const sync = useCallback(() => {
    const liveHero = panel.querySelector<HTMLElement>(":scope > .player-hero");
    const portrait = liveHero?.querySelector<HTMLElement>(".hero-portrait");
    setAbilities(readAbilities(panel));
    if (!liveHero || !portrait) return;

    const heroRect = liveHero.getBoundingClientRect();
    const artRect = portrait.getBoundingClientRect();
    if (!heroRect.width || !heroRect.height || !artRect.width || !artRect.height) return;

    const artLeft = artRect.left - heroRect.left;
    const artTop = artRect.top - heroRect.top;
    const artRight = artRect.right - heroRect.left;
    const outsideBoth = Math.max(artRight, heroRect.width);
    const gap = Math.max(5, Math.min(12, artRect.width * 0.055));

    liveHero.style.setProperty("--hh-hero-art-left", `${artLeft}px`);
    liveHero.style.setProperty("--hh-hero-art-top", `${artTop}px`);
    liveHero.style.setProperty("--hh-hero-art-width", `${artRect.width}px`);
    liveHero.style.setProperty("--hh-hero-art-height", `${artRect.height}px`);
    liveHero.style.setProperty("--hh-hero-art-right", `${artRight}px`);
    setPosition({
      left: outsideBoth + gap,
      top: artTop + artRect.height / 2,
    });
  }, [panel]);

  useEffect(() => {
    sync();
    const commandBar = panel.querySelector<HTMLElement>(".hero-command-bar");
    const portrait = panel.querySelector<HTMLElement>(".hero-portrait");
    const heroNode = panel.querySelector<HTMLElement>(":scope > .player-hero");

    const mutationObserver = new MutationObserver(sync);
    if (commandBar) mutationObserver.observe(commandBar, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "aria-disabled", "data-ability-tooltip", "data-ability-state"],
    });

    const resizeObserver = new ResizeObserver(sync);
    if (portrait) resizeObserver.observe(portrait);
    if (heroNode) resizeObserver.observe(heroNode);
    window.addEventListener("resize", sync, { passive: true });

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [panel, sync]);

  if (!hero || abilities.length === 0) return null;

  return createPortal(
    <div
      className="hero-ability-rail"
      data-hero-ability-rail="true"
      aria-label="Atalhos das habilidades do herói"
      style={{ left: position.left, top: position.top } as CSSProperties}
    >
      {abilities.map((ability) => (
        <button
          type="button"
          className="hero-ability-orb"
          key={ability.slot}
          data-ability-slot={ability.slot + 1}
          data-active={ability.active ? "true" : "false"}
          data-available={ability.available ? "true" : "false"}
          data-locked={ability.locked ? "true" : "false"}
          data-passive={ability.passive ? "true" : "false"}
          aria-disabled={!ability.available}
          aria-label={ability.tooltip.replace(/\s+/g, " ")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!ability.available) return;
            ability.source.click();
          }}
        >
          <span className="hero-ability-orb-glyph" aria-hidden="true">{ability.glyph}</span>
          <span className="hero-ability-orb-level" aria-hidden="true">{ability.slot + 1}</span>
          <span className="hero-ability-orb-tooltip" role="tooltip">{ability.tooltip}</span>
        </button>
      ))}
    </div>,
    hero,
  );
}

export default function HeroAbilityRailRuntime() {
  const [panels, setPanels] = useState<HTMLElement[]>([]);

  useEffect(() => {
    const syncPanels = () => {
      const next = Array.from(document.querySelectorAll<HTMLElement>(PANEL_SELECTOR));
      setPanels((current) => current.length === next.length && current.every((panel, index) => panel === next[index]) ? current : next);
    };
    syncPanels();
    const observer = new MutationObserver(syncPanels);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  return <>{panels.map((panel) => (
    <HeroAbilityRail
      key={panel.classList.contains("enemy") ? "enemy-hero-ability-rail" : "player-hero-ability-rail"}
      panel={panel}
    />
  ))}</>;
}

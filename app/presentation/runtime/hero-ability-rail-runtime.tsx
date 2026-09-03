"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type AbilityIcon = {
  source: HTMLButtonElement;
  slot: number;
  level: number;
  glyph: string;
  tooltip: string;
  active: boolean;
  available: boolean;
  locked: boolean;
  passive: boolean;
  owned: boolean;
};

type AbilityTooltip = {
  ability: AbilityIcon;
  left: number;
  top: number;
  width: number;
} | null;

const PANEL_SELECTOR = ".screen-game .hero-panel-stack.canonical-hero-panel";
const CHIP_SELECTOR = ".hero-command-bar .hero-ability-chip";
const TOOLTIP_DELAY_MS = 1_000;

const HERO_ABILITY_GLYPHS: Record<string, readonly [string, string, string]> = {
  gimble: ["♥", "↻", "◇"],
  goblin: ["♟", "✦", "¤"],
  uruk: ["◆", "−", "⧉"],
  tifon: ["☠", "✹", "Ⅱ"],
  saymon: ["✹", "♥", "⛨"],
  tessalia: ["⚔", "⇈", "⛨"],
  quarion: ["✦", "↩", "Ⅱ"],
  rasmus: ["☕", "♥", "⇄"],
  ngoro: ["⌕", "⌁", "◌"],
  zayan: ["⚔", "⛨", "➤"],
  natureza: ["●", "✚", "↻"],
};

function normalizedPanelText(panel: HTMLElement) {
  return (panel.textContent || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function heroKeyForPanel(panel: HTMLElement) {
  const text = normalizedPanelText(panel);
  if (/\bgimble\b/.test(text)) return "gimble";
  if (/sr\.?\s*goblin|mercador/.test(text)) return "goblin";
  if (/\buruk\b/.test(text)) return "uruk";
  if (/\btifon\b/.test(text)) return "tifon";
  if (/\bsaymon\b/.test(text)) return "saymon";
  if (/tessalia|mao de ferro/.test(text)) return "tessalia";
  if (/\bquarion\b/.test(text)) return "quarion";
  if (/\brasmus\b|barista do tempo/.test(text)) return "rasmus";
  if (/\bngoro\b|investigador/.test(text)) return "ngoro";
  if (/\bzayan\b|revolucionaria/.test(text)) return "zayan";
  if (/campeao de natureza/.test(text)) return "natureza";
  return "";
}

function semanticFallbackGlyph(copy: string, slot: number) {
  const text = copy.toLocaleLowerCase("pt-BR");
  if (/desvire|\bvire\b/.test(text)) return "↻";
  if (/roubo de vida|\bcure\b/.test(text)) return "♥";
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

function glyphForAbility(heroKey: string, copy: string, slot: number) {
  return HERO_ABILITY_GLYPHS[heroKey]?.[slot] ?? semanticFallbackGlyph(copy, slot);
}

function cleanAbilityTooltip(copy: string, heroKey: string, slot: number) {
  let text = copy
    .replace(/(?:Pagar\s+\d+\s+de\s+vida|Gastar\s+\d+\s+Pistas|Ativar)\.\s*Depois de ativada, esta habilidade segue as condições e os alvos descritos acima\.?/gi, "")
    .replace(/Efeito passivo:\s*resolve automaticamente sempre que a condição descrita for atendida\.?/gi, "")
    .replace(/\(uma vez\s*\/\s*turno\)/gi, "(uma vez por turno)")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (heroKey === "saymon" && slot === 0) {
    text = text.replace(
      /^Pague 2 de vida:\s*cause 1 a um alvo\s*\(uma vez por turno\)\.?/i,
      "Pague 2 de vida para causar 1 de dano a um alvo. Uma vez por turno.",
    );
  } else if (heroKey === "saymon" && slot === 1) {
    text = text.replace(
      /^Pague 2 de vida:\s*dê Roubo de Vida a uma criatura\.?/i,
      "Pague 2 de vida para dar Roubo de Vida a uma criatura.",
    );
  }

  return text;
}

function readAbilities(panel: HTMLElement): AbilityIcon[] {
  const owned = panel.classList.contains("player") && !panel.classList.contains("enemy");
  const heroKey = heroKeyForPanel(panel);
  return Array.from(panel.querySelectorAll<HTMLButtonElement>(CHIP_SELECTOR)).slice(0, 3).map((source, slot) => {
    const rawCopy = (source.dataset.abilityTooltip || source.getAttribute("aria-label") || source.textContent || `Habilidade ${slot + 1}`).trim();
    const tooltipHeader = rawCopy.match(/^(ATIVA|PASSIVA)\s*[·•\-–—]\s*NÍVEL\s*(\d+)(?:\s*\r?\n|\s*$)/i);
    const declaredType = tooltipHeader?.[1]?.toLocaleUpperCase("pt-BR");
    const active = declaredType ? declaredType === "ATIVA" : source.classList.contains("is-active") || source.classList.contains("active");
    const level = tooltipHeader ? Number(tooltipHeader[2]) || slot + 1 : slot + 1;
    const tooltipBody = tooltipHeader ? rawCopy.slice(tooltipHeader[0].length).trim() : rawCopy;
    const tooltip = cleanAbilityTooltip(tooltipBody, heroKey, slot) || tooltipBody || rawCopy;
    const locked = source.classList.contains("is-locked") || source.classList.contains("locked");
    const available = owned
      && active
      && !locked
      && source.classList.contains("is-available")
      && source.getAttribute("aria-disabled") !== "true";
    return {
      source,
      slot,
      level,
      glyph: glyphForAbility(heroKey, tooltip, slot),
      tooltip,
      active,
      available,
      locked,
      passive: !active,
      owned,
    };
  });
}

function lineageColor(panel: HTMLElement, hero: HTMLElement) {
  for (const node of [panel, hero, panel.querySelector<HTMLElement>(".hero-command-bar")]) {
    if (!node) continue;
    const value = getComputedStyle(node).getPropertyValue("--deck").trim();
    if (value) return value;
  }
  return "#8b929a";
}

function tooltipGeometry(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.max(190, Math.min(320, window.innerWidth - 20));
  const gap = 10;
  const right = rect.right + gap;
  const left = right + width <= window.innerWidth - 8
    ? right
    : Math.max(8, rect.left - width - gap);
  const top = Math.max(8, Math.min(window.innerHeight - 96, rect.top + rect.height / 2 - 40));
  return { left, top, width };
}

function HeroAbilityRail({ panel }: { panel: HTMLElement }) {
  const [abilities, setAbilities] = useState<AbilityIcon[]>(() => readAbilities(panel));
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [lineage, setLineage] = useState("#8b929a");
  const [tooltip, setTooltip] = useState<AbilityTooltip>(null);
  const tooltipTimer = useRef<number | null>(null);
  const hero = panel.querySelector<HTMLElement>(":scope > .player-hero");

  const clearTooltipTimer = useCallback(() => {
    if (tooltipTimer.current != null) window.clearTimeout(tooltipTimer.current);
    tooltipTimer.current = null;
  }, []);

  const closeTooltip = useCallback(() => {
    clearTooltipTimer();
    setTooltip(null);
  }, [clearTooltipTimer]);

  const openTooltip = useCallback((ability: AbilityIcon, anchor: HTMLElement, delayed: boolean) => {
    clearTooltipTimer();
    const show = () => setTooltip({ ability, ...tooltipGeometry(anchor) });
    if (delayed) tooltipTimer.current = window.setTimeout(show, TOOLTIP_DELAY_MS);
    else show();
  }, [clearTooltipTimer]);

  const sync = useCallback(() => {
    const liveHero = panel.querySelector<HTMLElement>(":scope > .player-hero");
    const portrait = liveHero?.querySelector<HTMLElement>(".hero-portrait");
    setAbilities(readAbilities(panel));
    if (!liveHero || !portrait) return;

    setLineage(lineageColor(panel, liveHero));

    const levelNode = liveHero.querySelector<HTMLElement>(".hero-level");
    const levelNumber = levelNode?.textContent?.match(/\d+/)?.[0];
    if (levelNode && levelNumber) levelNode.dataset.hhLevelShort = `Nv. ${levelNumber}`;

    const evolutionNode = liveHero.querySelector<HTMLElement>(".hero-evolution");
    const evolutionCopy = evolutionNode?.textContent || "";
    const progressMatch = evolutionCopy.match(/(\d+)\s*\/\s*(\d+)/);
    if (progressMatch) {
      const current = Number(progressMatch[1]);
      const target = Number(progressMatch[2]);
      const progress = target > 0 ? Math.max(0, Math.min(100, current / target * 100)) : 0;
      liveHero.style.setProperty("--hh-hero-level-progress", `${progress}%`);
      if (evolutionNode) evolutionNode.dataset.hhProgressCopy = `${current}/${target}`;
    }

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
    if (heroNode) mutationObserver.observe(heroNode, { subtree: true, childList: true, characterData: true });

    const resizeObserver = new ResizeObserver(sync);
    if (portrait) resizeObserver.observe(portrait);
    if (heroNode) resizeObserver.observe(heroNode);
    window.addEventListener("resize", sync, { passive: true });

    return () => {
      clearTooltipTimer();
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [panel, sync, clearTooltipTimer]);

  if (!hero || abilities.length === 0) return null;

  const rail = createPortal(
    <div
      className="hero-ability-rail"
      data-hero-ability-rail="true"
      aria-label="Atalhos das habilidades do herói"
      style={{ left: position.left, top: position.top, "--hh-ability-lineage": lineage } as CSSProperties}
    >
      {abilities.map((ability) => {
        const label = `${ability.active ? "Ativa" : "Passiva"}, nível ${ability.level}: ${ability.tooltip.replace(/\s+/g, " ")}`;
        const glyph = <span className="hero-ability-orb-glyph" aria-hidden="true">{ability.glyph}</span>;
        return (
          <span className="hero-ability-orb-entry" key={ability.slot}>
            <span className="hero-ability-orb-level" aria-hidden="true">{ability.level}</span>
            {ability.available ? (
              <button
                type="button"
                className="hero-ability-orb"
                data-ability-slot={ability.slot + 1}
                data-active={ability.active ? "true" : "false"}
                data-available="true"
                data-locked={ability.locked ? "true" : "false"}
                data-passive={ability.passive ? "true" : "false"}
                data-owned={ability.owned ? "true" : "false"}
                aria-label={label}
                onPointerEnter={(event) => openTooltip(ability, event.currentTarget, true)}
                onPointerLeave={closeTooltip}
                onFocus={(event) => openTooltip(ability, event.currentTarget, false)}
                onBlur={closeTooltip}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  ability.source.click();
                }}
              >
                {glyph}
              </button>
            ) : (
              <span
                className="hero-ability-orb"
                data-ability-slot={ability.slot + 1}
                data-active={ability.active ? "true" : "false"}
                data-available="false"
                data-locked={ability.locked ? "true" : "false"}
                data-passive={ability.passive ? "true" : "false"}
                data-owned={ability.owned ? "true" : "false"}
                role="img"
                tabIndex={0}
                aria-label={label}
                onPointerEnter={(event) => openTooltip(ability, event.currentTarget, true)}
                onPointerLeave={closeTooltip}
                onFocus={(event) => openTooltip(ability, event.currentTarget, false)}
                onBlur={closeTooltip}
              >
                {glyph}
              </span>
            )}
          </span>
        );
      })}
    </div>,
    hero,
  );

  const tooltipPortal = tooltip && typeof document !== "undefined" ? createPortal(
    <div
      className="hh-global-tooltip-portal hero-ability-tooltip-portal"
      role="tooltip"
      style={{
        "--hh-tooltip-left": `${tooltip.left}px`,
        "--hh-tooltip-top": `${tooltip.top}px`,
        "--hh-tooltip-width": `${tooltip.width}px`,
      } as CSSProperties}
    >
      <small>{tooltip.ability.active ? "ATIVA" : "PASSIVA"} · NÍVEL {tooltip.ability.level}</small>
      <p>{tooltip.ability.tooltip}</p>
    </div>,
    document.body,
  ) : null;

  return <>{rail}{tooltipPortal}</>;
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

  return <>{panels.map((panel, index) => (
    <HeroAbilityRail
      key={`${panel.classList.contains("enemy") ? "enemy" : "player"}-hero-ability-rail-${index}`}
      panel={panel}
    />
  ))}</>;
}
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CardPreviewRuntime from "./card-preview-runtime";
import { RemoteCardArt } from "./remote-card-art";

/*
 * Consolidated client-side UI runtime.
 *
 * This file replaces the small one-off runtime components that accumulated
 * while iterating on the match UI. Core game/rules modules stay separate by
 * responsibility; transient DOM guards live together here.
 */

/* --------------------------------------------------------------------------
   Command-bar text autofit
   -------------------------------------------------------------------------- */

const COMMAND_CHIP_SELECTOR = ".screen-game .hero-command-bar .hero-ability-chip";
const originalInlineFont = new WeakMap<HTMLElement, string>();

function restoreCommandFont(node: HTMLElement) {
  if (!originalInlineFont.has(node)) originalInlineFont.set(node, node.style.fontSize);
  node.style.fontSize = originalInlineFont.get(node) ?? "";
}

function commandContentFits(chip: HTMLElement, content: HTMLElement) {
  const tolerance = 0.5;
  const chipRect = chip.getBoundingClientRect();
  const style = getComputedStyle(chip);
  const innerTop = chipRect.top + (parseFloat(style.paddingTop) || 0);
  const innerBottom = chipRect.bottom - (parseFloat(style.paddingBottom) || 0);
  const innerLeft = chipRect.left + (parseFloat(style.paddingLeft) || 0);
  const innerRight = chipRect.right - (parseFloat(style.paddingRight) || 0);
  const contentRect = content.getBoundingClientRect();

  return (
    content.scrollHeight <= content.clientHeight + tolerance &&
    content.scrollWidth <= content.clientWidth + tolerance &&
    contentRect.top >= innerTop - tolerance &&
    contentRect.bottom <= innerBottom + tolerance &&
    contentRect.left >= innerLeft - tolerance &&
    contentRect.right <= innerRight + tolerance
  );
}

function fitCommandChip(chip: HTMLElement) {
  const content = chip.querySelector<HTMLElement>(":scope > span");
  if (!content || chip.clientWidth <= 0 || chip.clientHeight <= 0) return;

  const title = content.querySelector<HTMLElement>(":scope > b");
  const description = content.querySelector<HTMLElement>("p");
  const nodes = [title, description].filter(Boolean) as HTMLElement[];
  if (!nodes.length) return;

  nodes.forEach(restoreCommandFont);
  chip.dataset.commandTextFit = "native";

  const baseSizes = nodes.map((node) => parseFloat(getComputedStyle(node).fontSize) || 4);
  if (commandContentFits(chip, content)) return;

  const minimumScale = 0.32;
  const applyScale = (scale: number) => {
    nodes.forEach((node, index) => {
      const minimum = Math.min(baseSizes[index], 2.15);
      node.style.fontSize = `${Math.max(minimum, baseSizes[index] * scale)}px`;
    });
  };

  applyScale(minimumScale);
  if (!commandContentFits(chip, content)) {
    chip.dataset.commandTextFit = "minimum";
    return;
  }

  let low = minimumScale;
  let high = 1;
  let best = minimumScale;
  for (let index = 0; index < 10; index += 1) {
    const mid = (low + high) / 2;
    applyScale(mid);
    if (commandContentFits(chip, content)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  applyScale(best);
  chip.dataset.commandTextFit = "scaled";
}

function useCommandBarTextAutofit() {
  useEffect(() => {
    let frame = 0;
    const observed = new Set<HTMLElement>();
    const resizeObserver = new ResizeObserver((entries) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        entries.forEach((entry) => fitCommandChip(entry.target as HTMLElement));
      });
    });

    const scan = () => {
      document.querySelectorAll<HTMLElement>(COMMAND_CHIP_SELECTOR).forEach((chip) => {
        if (!observed.has(chip)) {
          observed.add(chip);
          resizeObserver.observe(chip);
        }
        fitCommandChip(chip);
      });
    };

    const queueScan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    };

    const mutationObserver = new MutationObserver(queueScan);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("resize", queueScan, { passive: true });
    if (document.fonts?.ready) void document.fonts.ready.then(queueScan);
    queueScan();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", queueScan);
    };
  }, []);
}

/* --------------------------------------------------------------------------
   Target / placement banner geometry
   -------------------------------------------------------------------------- */

const geometryPx = (value: number) => `${Math.round(value * 1000) / 1000}px`;

const visibleBoardRects = (board: HTMLElement, selector: string) => {
  const boardRect = board.getBoundingClientRect();
  return Array.from(board.querySelectorAll<HTMLElement>(selector))
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > boardRect.left && rect.left < boardRect.right && rect.bottom > boardRect.top && rect.top < boardRect.bottom);
};

const boardLaneCenterY = (board: HTMLElement) => {
  const boardRect = board.getBoundingClientRect();
  const terrains = visibleBoardRects(board, ".terrain-slot").sort((a, b) => a.top - b.top);
  if (terrains.length >= 2) return (terrains[0].bottom + terrains[terrains.length - 1].top) / 2;
  return boardRect.top + boardRect.height / 2;
};

function positionCompactBanner(board: HTMLElement, banner: HTMLElement, anchor: "left" | "right") {
  const boardRect = board.getBoundingClientRect();
  const creatureSlots = visibleBoardRects(board, ".creature-slot");
  if (!creatureSlots.length) return;

  const firstCreatureLeft = Math.min(...creatureSlots.map((rect) => rect.left));
  const lastCreatureRight = Math.max(...creatureSlots.map((rect) => rect.right));
  const gap = Math.max(8, Math.min(24, boardRect.width * 0.014));
  const edgePadding = Math.max(6, boardRect.width * 0.01);
  const centerY = boardLaneCenterY(board);

  banner.style.setProperty("position", "absolute", "important");
  banner.style.setProperty("width", "max-content", "important");
  banner.style.setProperty("min-width", "0", "important");
  banner.style.setProperty("max-width", `${Math.max(150, Math.min(330, boardRect.width * 0.285))}px`, "important");
  banner.style.setProperty("height", "auto", "important");
  banner.style.setProperty("min-height", "0", "important");
  banner.style.setProperty("max-height", "none", "important");
  banner.style.setProperty("right", "auto", "important");
  banner.style.setProperty("bottom", "auto", "important");
  banner.style.setProperty("margin", "0", "important");
  banner.style.setProperty("padding", "clamp(.38rem,.72cqh,.68rem) clamp(.55rem,.8cqw,.85rem)", "important");
  banner.style.setProperty("transform", "translateY(-50%)", "important");
  banner.style.setProperty("z-index", "68", "important");

  const width = banner.getBoundingClientRect().width;
  let leftViewport: number;

  if (anchor === "left") {
    const bannerRight = firstCreatureLeft - gap;
    leftViewport = Math.max(boardRect.left + edgePadding, bannerRight - width);
  } else {
    const sidePileRects = visibleBoardRects(board, ".side-piles");
    const candidates = sidePileRects.filter((rect) => rect.left > lastCreatureRight).map((rect) => rect.left);
    const rightLimit = candidates.length ? Math.min(...candidates, boardRect.right - edgePadding) : boardRect.right - edgePadding;
    const desiredLeft = lastCreatureRight + gap;
    leftViewport = Math.min(desiredLeft, Math.max(lastCreatureRight + 4, rightLimit - width - gap));
    leftViewport = Math.max(boardRect.left + edgePadding, Math.min(leftViewport, boardRect.right - width - edgePadding));
  }

  banner.style.setProperty("left", geometryPx(leftViewport - boardRect.left), "important");
  banner.style.setProperty("top", geometryPx(centerY - boardRect.top), "important");
  banner.dataset.geometryAnchored = anchor;
}

function stylePlacementTargets(board: HTMLElement) {
  const active = Array.from(board.querySelectorAll<HTMLElement>(".field-slot.placement-target"));
  const activeSet = new Set(active);

  for (const slot of Array.from(board.querySelectorAll<HTMLElement>(".field-slot"))) {
    if (activeSet.has(slot)) {
      slot.style.setProperty("cursor", "pointer", "important");
      slot.style.setProperty("outline", "clamp(1px,.14cqw,2px) solid var(--gold, #e4b13f)", "important");
      slot.style.setProperty("outline-offset", "clamp(1px,.12cqw,3px)", "important");
      slot.style.setProperty("box-shadow", "0 0 clamp(.45rem,1.1cqw,1rem) color-mix(in srgb, var(--gold, #e4b13f) 72%, transparent)", "important");
      slot.style.setProperty("filter", "brightness(1.18)", "important");
      slot.dataset.cafePlacementHighlighted = "true";
    } else if (slot.dataset.cafePlacementHighlighted === "true") {
      slot.style.removeProperty("cursor");
      slot.style.removeProperty("outline");
      slot.style.removeProperty("outline-offset");
      slot.style.removeProperty("box-shadow");
      slot.style.removeProperty("filter");
      delete slot.dataset.cafePlacementHighlighted;
    }
  }
}

function positionBoardDecisionBanners() {
  const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
  if (!board) return;

  const normalTargetBanner = board.querySelector<HTMLElement>(":scope > .target-banner:not(.cafe-time-placement-banner)");
  const cafeTimeBanner = board.querySelector<HTMLElement>(":scope > .cafe-time-placement-banner");

  if (normalTargetBanner) positionCompactBanner(board, normalTargetBanner, "left");
  if (cafeTimeBanner) positionCompactBanner(board, cafeTimeBanner, "right");
  stylePlacementTargets(board);
}

function useTargetBannerPositionGuard() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(positionBoardDecisionBanners);
    };

    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });

    const resize = new ResizeObserver(schedule);
    const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
    if (board) resize.observe(board);

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, []);
}

/* --------------------------------------------------------------------------
   Hero inspector canonicalization
   -------------------------------------------------------------------------- */

type HeroGuideData = {
  names: string[];
  faction: string;
  color: string;
  requirement: [number, number];
  criterion: string;
  milestone: (target: number) => string;
  abilities: Array<{ active: boolean; text: string }>;
};

const HERO_GUIDES: HeroGuideData[] = [
  { names:["Gimble, Presenteado Sortudo","Gimble"], faction:"Natureza", color:"#2d9a58", requirement:[2,4], criterion:"Controle simultaneamente a quantidade indicada de Dragões.", milestone:n=>`Controle ${n} Dragões simultaneamente no campo.`, abilities:[{active:false,text:"Quando um Dragão deixa o campo, cure 1."},{active:true,text:"Uma vez por turno, desvire um Dragão aliado."},{active:false,text:"Na manutenção, seus Dragões recebem +1/+1."}] },
  { names:["Sr. Goblin, o Mercador","Sr. Goblin","Sr Goblin"], faction:"Caos", color:"#8d45ce", requirement:[3,5], criterion:"Jogue a quantidade indicada de cartas no mesmo turno; o progresso reinicia no próximo turno.", milestone:n=>`Jogue ${n} cartas durante o mesmo turno.`, abilities:[{active:false,text:"Ao perder um Goblin, compre 1 carta (uma vez por turno)."},{active:false,text:"Compre 1 carta adicional na manutenção."},{active:false,text:"O primeiro Goblin do turno custa 0."}] },
  { names:["Uruk, a Encantriz","Uruk"], faction:"Divino", color:"#378ed0", requirement:[4,8], criterion:"Conjure a quantidade indicada de feitiços ao longo da partida.", milestone:n=>`Conjure ${n} feitiços ao longo da partida.`, abilities:[{active:false,text:"Fim do turno: ative o elemento do último feitiço."},{active:false,text:"Seu primeiro feitiço custa 1 a menos."},{active:false,text:"Duplique o último feitiço do seu turno."}] },
  { names:["Tifon, a Peste","Tifon"], faction:"Neutro", color:"#777d86", requirement:[3,7], criterion:"Registre a quantidade indicada de mortes de criaturas aliadas.", milestone:n=>`Registre ${n} mortes de criaturas aliadas.`, abilities:[{active:false,text:"Quando uma criatura sua morrer, compre 1 carta (máx. 3)."},{active:false,text:"Último Suspiro aliado causa 1 ao herói inimigo."},{active:false,text:"Seus Últimos Suspiros são ativados duas vezes."}] },
  { names:["Saymon, o Primeiro","Saymon"], faction:"Neutro", color:"#777d86", requirement:[3,5], criterion:"Acumule a quantidade indicada de eventos de perda de vida no turno atual.", milestone:n=>`Acumule ${n} eventos de perda de vida no mesmo turno.`, abilities:[{active:true,text:"Pague 2 de vida: cause 1 a um alvo (uma vez por turno)."},{active:true,text:"Pague 2 de vida: dê Roubo de Vida a uma criatura."},{active:false,text:"Custos de vida não podem reduzir sua vida abaixo de 1."}] },
  { names:["Tessália, a Mão de Ferro","Tessália"], faction:"Ordem", color:"#d54a45", requirement:[3,6], criterion:"Declare a quantidade indicada de ataques com a criatura Comandante central.", milestone:n=>`Declare ${n} ataques com a criatura Comandante central.`, abilities:[{active:false,text:"Seu Comandante tem +2 de Ofensividade e sem ele você não pode atacar."},{active:false,text:"Seu Comandante tem Atropelar e recebe +3."},{active:false,text:"Uma vez por turno, outra criatura pode morrer pelo Comandante."}] },
  { names:["Quarion Siannodel","Quarion"], faction:"Ordem", color:"#c84642", requirement:[2,4], criterion:"Controle a quantidade indicada de criaturas de nomes diferentes com Primeiro Ato.", milestone:n=>`Controle ${n} criaturas de nomes diferentes com Primeiro Ato.`, abilities:[{active:false,text:"Ao ativar Primeiro Ato, compre 1 carta (uma vez por turno)."},{active:false,text:"A primeira criatura que morrer no seu turno volta à mão."},{active:false,text:"O primeiro Primeiro Ato do turno é ativado novamente."}] },
  { names:["Rasmus, o Barista do Tempo","Rasmus"], faction:"Divino", color:"#378ed0", requirement:[5,7], criterion:"Controle simultaneamente a quantidade indicada de Gatos considerando ambos os campos.", milestone:n=>`Existam ${n} Gatos simultaneamente somando os dois campos.`, abilities:[{active:false,text:"Após 10 Cafés, crie um Café Especial."},{active:false,text:"Quando um Gato causar dano a um jogador, cure 1."},{active:false,text:"Gatos também podem ocupar espaços de não-criaturas."}] },
  { names:["Ngoro, o Investigador","Ngoro"], faction:"Caos", color:"#7949b5", requirement:[5,10], criterion:"Acumule a quantidade indicada de Pistas disponíveis.", milestone:n=>`Acumule ${n} Pistas disponíveis.`, abilities:[{active:false,text:"Ao Investigar, ganhe 1 Pista; no início, Investigue 1."},{active:true,text:"Gaste 2 Pistas: compre 1 ou triture 2."},{active:true,text:"Gaste 3 Pistas: dê Furtivo a uma criatura aliada."}] },
  { names:["Zayan, a Revolucionária","Zayan"], faction:"Ordem", color:"#cf4c45", requirement:[3,4], criterion:"Controle a quantidade indicada de constantes sem texto de efeito.", milestone:n=>`Controle ${n} constantes sem texto de efeito.`, abilities:[{active:false,text:"No combate, uma criatura sem efeito recebe +1/+1."},{active:false,text:"Outra criatura pode ser destruída no lugar de uma sem efeito."},{active:false,text:"Criaturas sem efeito recebem Investida."}] },
  { names:["Campeão de Natureza"], faction:"Natureza", color:"#289455", requirement:[10,20], criterion:"Acumule a quantidade indicada de marcadores de ação em suas constantes.", milestone:n=>`Acumule ${n} marcadores de ação em suas constantes.`, abilities:[{active:true,text:"Uma vez por turno, dê 2 marcadores a até duas constantes."},{active:false,text:"Ao colocar marcadores, coloque um adicional."},{active:true,text:"Remova 4 marcadores: vire uma criatura alvo."}] },
];

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[character]!));

function renderHeroGuide(hero: HeroGuideData, canonicalName: string) {
  const abilities = hero.abilities.map((ability, index) => `<article><span>${index + 1}</span><div><p><em class="${ability.active ? "active" : "passive"}">${ability.active ? "Ativa" : "Passiva"}</em><span>${escapeHtml(ability.text)}</span></p></div></article>`).join("");
  const milestones = hero.requirement.map((target, index) => `<li><span>NÍVEL ${index + 2}</span><b>${escapeHtml(hero.milestone(target))}</b></li>`).join("");
  return `<div class="inspector-hero-guide canonical-runtime-guide" style="--deck:${hero.color}"><section class="hero-guide" style="--deck:${hero.color}"><header><span>GUIA DO HERÓI</span><h3>${escapeHtml(canonicalName)}</h3><p>${escapeHtml(hero.faction)}</p></header><section class="hero-evolution-guide"><div class="hero-guide-title"><i>✦</i><span><small>CONDIÇÃO DE EVOLUÇÃO</small><b>Como subir de nível</b></span></div><p>${escapeHtml(hero.criterion)}</p><ol>${milestones}</ol></section><section class="hero-abilities-guide"><div class="hero-guide-title"><i>◆</i><span><small>HABILIDADES</small><b>Poderes liberados por nível</b></span></div><div>${abilities}</div></section></section></div>`;
}

function useHeroInspectorCanonicalizer() {
  useEffect(() => {
    const canonicalize = () => {
      document.querySelectorAll<HTMLElement>(".card-focus-layer.inspector").forEach((dialog) => {
        const label = dialog.getAttribute("aria-label") || "";
        const hero = HERO_GUIDES.find((candidate) => candidate.names.some((name) => label.toLocaleLowerCase("pt-BR").includes(name.toLocaleLowerCase("pt-BR"))));
        if (!hero) return;
        const aside = dialog.querySelector<HTMLElement>("aside");
        if (!aside || aside.querySelector(".canonical-runtime-guide")) return;
        aside.innerHTML = renderHeroGuide(hero, hero.names[0]);
      });
    };

    canonicalize();
    const observer = new MutationObserver(canonicalize);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}

/* --------------------------------------------------------------------------
   Response-window anchor
   -------------------------------------------------------------------------- */

function useResponseWindowAnchor() {
  useEffect(() => {
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const visibleRect = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      return node.offsetParent !== null && rect.width > 0 && rect.height > 0 ? rect : null;
    };

    const sync = () => {
      frame = 0;
      const game = document.querySelector<HTMLElement>(".screen-game");
      if (!game) return;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const fallbackRight = Math.max(8, Math.min(24, viewportWidth * 0.0125));
      const fallbackTop = Math.max(44, Math.min(76, viewportHeight * 0.065));

      const allDecks = [...game.querySelectorAll<HTMLElement>(".pile-zone.main-deck")]
        .map((node) => ({ node, rect: visibleRect(node) }))
        .filter((entry): entry is { node: HTMLElement; rect: DOMRect } => !!entry.rect);

      const opponentDeckEntry = allDecks
        .filter(({ rect }) => rect.left + rect.width / 2 > viewportWidth * 0.56 && rect.top + rect.height / 2 < viewportHeight * 0.5)
        .sort((a, b) => {
          const vertical = a.rect.top - b.rect.top;
          return Math.abs(vertical) > 4 ? vertical : b.rect.right - a.rect.right;
        })[0];

      let right = fallbackRight;
      let top = fallbackTop;
      let pileWidth = Math.max(180, Math.min(300, viewportWidth * 0.16));
      let anchorValid = false;

      if (opponentDeckEntry) {
        const deckRect = opponentDeckEntry.rect;
        const nearbyPiles = [...game.querySelectorAll<HTMLElement>(".pile-zone")]
          .map((node) => ({ node, rect: visibleRect(node) }))
          .filter((entry): entry is { node: HTMLElement; rect: DOMRect } => !!entry.rect)
          .filter(({ rect }) => {
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const deckCenterX = deckRect.left + deckRect.width / 2;
            const horizontalReach = Math.max(deckRect.width * 3.4, 170);
            const verticalBottom = Math.min(viewportHeight * 0.5, deckRect.bottom + Math.max(deckRect.height * 2.6, 170));
            return centerX > viewportWidth * 0.55 && Math.abs(centerX - deckCenterX) <= horizontalReach && centerY >= deckRect.top - 12 && centerY <= verticalBottom;
          });

        const rects = nearbyPiles.length ? nearbyPiles.map(({ rect }) => rect) : [deckRect];
        const clusterLeft = Math.min(...rects.map((rect) => rect.left));
        const clusterRight = Math.max(...rects.map((rect) => rect.right));
        const clusterTop = Math.min(...rects.map((rect) => rect.top));
        const clusterWidth = Math.max(deckRect.width, clusterRight - clusterLeft);

        anchorValid = clusterRight > viewportWidth * 0.7 && clusterTop < viewportHeight * 0.5;
        if (anchorValid) {
          right = Math.max(8, Math.min(viewportWidth * 0.28, viewportWidth - clusterRight));
          top = Math.max(8, Math.min(viewportHeight * 0.46, clusterTop));
          pileWidth = Math.max(clusterWidth, deckRect.width);
        }
      }

      game.style.setProperty("--response-opponent-piles-right", `${right}px`);
      game.style.setProperty("--response-opponent-piles-top", `${top}px`);
      game.style.setProperty("--response-opponent-piles-width", `${pileWidth}px`);
      game.dataset.responseAnchor = anchorValid ? "opponent-upper-right-piles" : "upper-right-fallback";
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    schedule();
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    resizeObserver = new ResizeObserver(schedule);
    const game = document.querySelector<HTMLElement>(".screen-game");
    if (game) resizeObserver.observe(game);
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);
}

/* --------------------------------------------------------------------------
   Match result hero portal
   -------------------------------------------------------------------------- */

const RESULT_HEROES = [
  { page: 2, name: "Gimble, Presenteado Sortudo" },
  { page: 26, name: "Sr. Goblin, o Mercador" },
  { page: 54, name: "Uruk, a Encantriz" },
  { page: 110, name: "Tifon, a Peste" },
  { page: 129, name: "Saymon, o Primeiro" },
  { page: 152, name: "Tessália, a Mão de Ferro" },
  { page: 180, name: "Quarion Siannodel" },
  { page: 211, name: "Rasmus, o Barista do Tempo" },
  { page: 255, name: "Ngoro, o Investigador" },
  { page: 273, name: "Zayan, a Revolucionária" },
  { page: 291, name: "Campeão de Natureza" },
] as const;

const foldText = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function MatchResultHeroPortal() {
  const [result, setResult] = useState<{ host: HTMLElement; page: number; name: string } | null>(null);

  useEffect(() => {
    let frame = 0;
    const scan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>(".overlay .maintenance"));
        const host = candidates.find((node) => /fim do teste/i.test(node.textContent || ""));
        if (!host) {
          setResult((current) => current ? null : current);
          return;
        }
        const text = foldText(host.textContent || "");
        const hero = RESULT_HEROES.find((candidate) => text.includes(foldText(candidate.name)));
        if (!hero) return;
        host.classList.add("enhanced-match-result");
        setResult((current) => current?.host === host && current.page === hero.page ? current : { host, ...hero });
      });
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!result) return null;
  return createPortal(
    <div className="match-result-hero-art" aria-label={`Herói vencedor: ${result.name}`}>
      <RemoteCardArt page={result.page} name={result.name} priority />
      <small>CAMPEÃO DA BATALHA</small>
      <b>{result.name}</b>
    </div>,
    result.host,
  );
}

export default function MatchUiRuntime() {
  useCommandBarTextAutofit();
  useTargetBannerPositionGuard();
  useHeroInspectorCanonicalizer();
  useResponseWindowAnchor();

  return <><CardPreviewRuntime/><MatchResultHeroPortal/></>;
}

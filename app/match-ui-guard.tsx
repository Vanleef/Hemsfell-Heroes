"use client";

import { useEffect } from "react";

const deckMeta: Record<string, { evolution: string; plan: string }> = {
  "Gimble, Presenteado Sortudo": { evolution: "Evolui ao estabelecer 2 e depois 4 Dragões.", plan: "Faça Dragões crescerem, recicle valor quando eles saem do campo e domine a mesa no jogo longo." },
  "Sr. Goblin, o Mercador": { evolution: "Evolui ao jogar 3 e depois 5 cartas no mesmo turno.", plan: "Encadeie cartas baratas, Fura-Fila e Goblins para transformar volume em compra e tempo." },
  "Uruk, a Encantriz": { evolution: "Evolui após conjurar 4 e depois 8 feitiços.", plan: "Alterne elementos, prepare efeitos adicionais e converta sequências de feitiços em controle." },
  "Tifon, a Peste": { evolution: "Evolui após 3 e depois 7 mortes de criaturas.", plan: "Use Último Suspiro e sacrifícios para transformar perdas planejadas em vantagem inevitável." },
  "Saymon, o Primeiro": { evolution: "Evolui após 3 e depois 5 eventos de perda de vida.", plan: "Trate a própria vida como recurso, estabilizando a partida com Vampiros e Roubo de Vida." },
  "Tessália, a Mão de Ferro": { evolution: "Evolui após 3 e depois 6 ataques.", plan: "Construa uma formação em torno do Comandante e pressione o combate com proteção e substituições." },
  "Quarion Siannodel": { evolution: "Evolui após resolver 2 e depois 4 nomes diferentes de Primeiro Ato.", plan: "Extraia valor de entradas em campo, recupere criaturas e reutilize seus melhores Primeiros Atos." },
  "Rasmus, Barista do Tempo": { evolution: "Evolui ao desenvolver 5 e depois 7 Gatos.", plan: "Acumule Cafés, espalhe Gatos e converta presença de mesa em cura e utilidade flexível." },
  "Ngoro, o Investigador": { evolution: "Evolui ao alcançar 5 e depois 10 Pistas.", plan: "Investigue decks, gere Pistas e gaste informação para comprar, triturar ou preparar ataques furtivos." },
  "Zayan, a Revolucionária": { evolution: "Evolui ao sustentar 3 e depois 4 constantes sem efeito.", plan: "Valorize criaturas simples com bônus de combate, substituições e Investida." },
  "Campeão de Natureza": { evolution: "Evolui ao distribuir 10 e depois 20 marcadores de ação.", plan: "Espalhe marcadores entre constantes e converta essa economia em controle de mesa." },
};

const createText = (tag: string, className: string, text: string) => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

const setTextIfChanged = (node: HTMLElement | null, text: string) => {
  if (node && node.textContent !== text) node.textContent = text;
};

function ensureLandingGuide() {
  const copy = document.querySelector<HTMLElement>(".landing-copy");
  if (!copy || copy.querySelector(".landing-mode-guide")) return;
  const guide = document.createElement("div");
  guide.className = "landing-mode-guide";
  const items = [
    ["⚔", "Duelo tático", "Reduza a vida do herói rival a zero usando criaturas, feitiços, artefatos e decisões de combate."],
    ["◆", "Contra IA", "Ideal para testar decks e aprender interações, com dificuldade ajustável antes da partida."],
    ["◎", "Multiplayer", "Crie uma sala privada, compartilhe o convite e enfrente outro jogador com estado autoritativo."],
    ["✦", "Heróis e coleção", "Compare arquétipos, evolução, poderes e listas completas antes de escolher seu deck."],
  ];
  for (const [icon, title, detail] of items) {
    const article = document.createElement("article");
    article.append(createText("i", "", icon), createText("b", "", title), createText("span", "", detail));
    guide.append(article);
  }
  copy.append(guide);
}

function enrichDeckPicker(picker: HTMLElement) {
  let summary = picker.querySelector<HTMLElement>(".deck-picker-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.className = "deck-picker-summary";
    summary.append(createText("strong", "deck-evolution", ""), createText("p", "deck-plan", ""));
    picker.append(summary);
  }
  const select = picker.querySelector<HTMLSelectElement>("select");
  const label = select?.selectedOptions?.[0]?.textContent?.trim() || "";
  const meta = deckMeta[label];
  if (!meta) return;
  setTextIfChanged(summary.querySelector<HTMLElement>(".deck-evolution"), meta.evolution);
  setTextIfChanged(summary.querySelector<HTMLElement>(".deck-plan"), meta.plan);
}

function enhanceDeckPickers() {
  document.querySelectorAll<HTMLElement>(".deck-picker").forEach(enrichDeckPicker);
}

function enhanceMatchResult() {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>(".overlay"));
  const result = overlays.find((overlay) => overlay.textContent?.includes("FIM DO TESTE"));
  if (!result) return;
  result.classList.add("match-result-overlay");
  const panel = result.querySelector<HTMLElement>(".maintenance");
  if (!panel || panel.dataset.enhancedResult === "true") return;
  panel.dataset.enhancedResult = "true";

  const victory = panel.textContent?.includes("Vitória") ?? false;
  const localHero = document.querySelector<HTMLElement>(".player-hero:not(.enemy)");
  const enemyHero = document.querySelector<HTMLElement>(".player-hero.enemy");
  const winnerHero = victory ? localHero : enemyHero;
  const opponentHero = victory ? enemyHero : localHero;
  const winnerName = winnerHero?.querySelector<HTMLElement>(".hero-short-name")?.textContent?.trim() || "Herói vencedor";
  const opponentName = opponentHero?.querySelector<HTMLElement>(".hero-short-name")?.textContent?.trim() || "Adversário";
  const image = winnerHero?.querySelector<HTMLImageElement>("img")?.cloneNode(true) as HTMLImageElement | undefined;
  if (image) {
    const art = document.createElement("div");
    art.className = "result-hero-art";
    art.append(image);
    panel.prepend(art);
  }
  const meta = document.createElement("div");
  meta.className = "result-match-meta";
  meta.append(createText("span", "", `Vencedor · ${winnerName}`), createText("span", "", `Adversário · ${opponentName}`));
  const actions = panel.querySelector<HTMLElement>(":scope > div:last-child");
  if (actions) panel.insertBefore(meta, actions);

  if (document.querySelector(".match-clock")) {
    const rematch = actions?.querySelector<HTMLButtonElement>("button.gold");
    if (rematch) {
      rematch.disabled = true;
      rematch.hidden = true;
    }
  }
  if (actions && !actions.querySelector(".result-menu-button")) {
    const menu = document.createElement("button");
    menu.className = "result-menu-button";
    menu.textContent = "Voltar ao menu";
    menu.addEventListener("click", () => document.querySelector<HTMLButtonElement>(".game-bar > button:first-child")?.click());
    actions.append(menu);
  }
}

function clearOrphanedMatchUi() {
  document.querySelectorAll(".engine-decision-backdrop,.defense-decision,.target-banner,.response-waiting,.match-reconnect-overlay,.priority-stack-indicator,.visual-effect,.deck-shuffle-effect,.combat-cinematic").forEach((node) => node.remove());
}

export default function MatchUiGuard() {
  useEffect(() => {
    let wasInMatch = !!document.querySelector(".game-stage");
    let inspectorSeenInMatch = wasInMatch && !!document.querySelector(".inspector");
    let syncQueued = false;

    const sync = () => {
      syncQueued = false;
      const inMatch = !!document.querySelector(".game-stage");
      document.body.dataset.matchActive = inMatch ? "true" : "false";
      if (inMatch && document.querySelector(".inspector")) inspectorSeenInMatch = true;
      if (wasInMatch && !inMatch) {
        clearOrphanedMatchUi();
        if (inspectorSeenInMatch) document.querySelector<HTMLButtonElement>(".inspector-close")?.click();
        inspectorSeenInMatch = false;
      }
      wasInMatch = inMatch;
      ensureLandingGuide();
      enhanceDeckPickers();
      enhanceMatchResult();
    };

    const scheduleSync = () => {
      if (syncQueued) return;
      syncQueued = true;
      queueMicrotask(sync);
    };

    const onChange = (event: Event) => {
      if (event.target instanceof HTMLSelectElement && event.target.closest(".deck-picker")) scheduleSync();
    };
    document.addEventListener("change", onChange, true);
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => {
      document.removeEventListener("change", onChange, true);
      observer.disconnect();
      delete document.body.dataset.matchActive;
    };
  }, []);

  return null;
}
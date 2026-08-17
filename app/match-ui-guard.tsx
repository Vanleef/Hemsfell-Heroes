"use client";

import { useEffect } from "react";

type HeroMeta = {
  faction: "Natureza" | "Caos" | "Divino" | "Ordem" | "Neutro";
  color: string;
  style: string;
  evolution: string;
  plan: string;
  abilities: Array<{ level: "I" | "II" | "III"; type: "Ativa" | "Passiva"; text: string }>;
};

const heroMeta: Record<string, HeroMeta> = {
  "Gimble, Presenteado Sortudo": { faction: "Natureza", color: "#2d9a58", style: "Dragões · crescimento", evolution: "Reúna 2 Dragões para o nível 2 e 4 Dragões para o nível 3.", plan: "Faça Dragões crescerem, recicle valor quando eles saem do campo e domine a mesa no jogo longo.", abilities: [{ level: "I", type: "Passiva", text: "Quando um Dragão deixa o campo, cure 1." }, { level: "II", type: "Ativa", text: "Uma vez por turno, desvire um Dragão aliado." }, { level: "III", type: "Passiva", text: "Na manutenção, seus Dragões recebem +1/+1." }] },
  "Sr. Goblin, o Mercador": { faction: "Caos", color: "#8d45ce", style: "Goblin · Fura-Fila", evolution: "Jogue 3 cartas no mesmo turno para o nível 2 e 5 cartas para o nível 3.", plan: "Encadeie cartas baratas, Fura-Fila e Goblins para transformar volume em compra e tempo.", abilities: [{ level: "I", type: "Passiva", text: "Ao perder um Goblin, compre 1 carta, uma vez por turno." }, { level: "II", type: "Passiva", text: "Compre 1 carta adicional na manutenção." }, { level: "III", type: "Passiva", text: "O primeiro Goblin do turno custa 0." }] },
  "Uruk, a Encantriz": { faction: "Divino", color: "#378ed0", style: "Elementos · feitiços", evolution: "Conjure 4 feitiços para o nível 2 e 8 feitiços para o nível 3.", plan: "Alterne elementos, prepare efeitos adicionais e converta sequências de feitiços em controle.", abilities: [{ level: "I", type: "Passiva", text: "No fim do turno, ative o elemento do último feitiço conjurado." }, { level: "II", type: "Passiva", text: "Seu primeiro feitiço custa 1 a menos." }, { level: "III", type: "Passiva", text: "No fim do turno, repita o último feitiço se ainda houver uma resolução válida." }] },
  "Tifon, a Peste": { faction: "Neutro", color: "#777d86", style: "Último Suspiro", evolution: "Registre 3 mortes de criaturas para o nível 2 e 7 mortes para o nível 3.", plan: "Use Último Suspiro e sacrifícios para transformar perdas planejadas em vantagem inevitável.", abilities: [{ level: "I", type: "Passiva", text: "Quando uma criatura sua morrer, compre 1 carta, até o limite indicado pelo efeito." }, { level: "II", type: "Passiva", text: "Último Suspiro aliado causa 1 de dano ao herói inimigo." }, { level: "III", type: "Passiva", text: "Seus Últimos Suspiros são ativados duas vezes." }] },
  "Saymon, o Primeiro": { faction: "Neutro", color: "#777d86", style: "Vampiros · Roubo de Vida", evolution: "Perca vida em 3 eventos para o nível 2 e em 5 eventos para o nível 3.", plan: "Trate a própria vida como recurso, estabilizando a partida com Vampiros e Roubo de Vida.", abilities: [{ level: "I", type: "Ativa", text: "Pague 2 de vida para causar 1 de dano a um alvo válido, uma vez por turno." }, { level: "II", type: "Ativa", text: "Pague 2 de vida para dar Roubo de Vida permanente a uma criatura aliada, exceto o próprio Saymon." }, { level: "III", type: "Passiva", text: "Custos de vida não podem reduzir sua vida abaixo de 1." }] },
  "Tessália, a Mão de Ferro": { faction: "Ordem", color: "#d54a45", style: "Comandante · formação", evolution: "Ataque 3 vezes para o nível 2 e 6 vezes para o nível 3.", plan: "Construa uma formação em torno do Comandante e pressione o combate com proteção e substituições.", abilities: [{ level: "I", type: "Passiva", text: "Seu Comandante recebe +2 de Ofensividade e, sem ele, as outras criaturas não podem atacar." }, { level: "II", type: "Passiva", text: "Seu Comandante recebe Atropelar e o bônus adicional indicado." }, { level: "III", type: "Passiva", text: "Uma vez por turno, outra criatura pode ser destruída no lugar do Comandante." }] },
  "Quarion Siannodel": { faction: "Ordem", color: "#c84642", style: "Primeiro Ato · valor", evolution: "Resolva 2 nomes diferentes de Primeiro Ato para o nível 2 e 4 nomes para o nível 3.", plan: "Extraia valor de entradas em campo, recupere criaturas e reutilize seus melhores Primeiros Atos.", abilities: [{ level: "I", type: "Passiva", text: "Ao ativar Primeiro Ato, compre 1 carta, uma vez por turno." }, { level: "II", type: "Passiva", text: "A primeira criatura que morrer no seu turno volta à mão." }, { level: "III", type: "Passiva", text: "O primeiro Primeiro Ato do turno é ativado novamente." }] },
  "Rasmus, Barista do Tempo": { faction: "Divino", color: "#378ed0", style: "Gatos · Café", evolution: "Tenha 5 Gatos em jogo para o nível 2 e 7 Gatos para o nível 3.", plan: "Acumule Cafés, espalhe Gatos e converta presença de mesa em cura e utilidade flexível.", abilities: [{ level: "I", type: "Passiva", text: "Após utilizar 10 efeitos com Café no nome, crie uma Imagem de Café Especial em sua mão." }, { level: "II", type: "Passiva", text: "Sempre que um Gato causar dano à vida de um jogador, cure 1 de vida." }, { level: "III", type: "Passiva", text: "Criaturas do tipo Gato podem entrar em espaços de Criatura e de Não Criatura; em espaço de Não Criatura, não podem receber Artefato." }] },
  "Ngoro, o Investigador": { faction: "Caos", color: "#7949b5", style: "Investigar · Triturar", evolution: "Alcance 5 Pistas para o nível 2 e 10 Pistas para o nível 3.", plan: "Investigue decks, gere Pistas e gaste informação para comprar, triturar ou preparar ataques furtivos.", abilities: [{ level: "I", type: "Passiva", text: "Ao Investigar, ganhe 1 Pista; no início, Investigue 1." }, { level: "II", type: "Ativa", text: "Gaste 2 Pistas para escolher entre comprar 1 carta ou triturar 2 cartas." }, { level: "III", type: "Ativa", text: "Gaste 3 Pistas para dar Furtivo a uma criatura aliada." }] },
  "Zayan, a Revolucionária": { faction: "Ordem", color: "#cf4c45", style: "Criaturas sem efeito", evolution: "Mantenha 3 constantes sem efeito para o nível 2 e 4 constantes para o nível 3.", plan: "Valorize criaturas simples com bônus de combate, substituições e Investida.", abilities: [{ level: "I", type: "Passiva", text: "No combate, uma criatura sem efeito recebe +1/+1." }, { level: "II", type: "Passiva", text: "Outra criatura pode ser destruída no lugar de uma criatura sem efeito." }, { level: "III", type: "Passiva", text: "Criaturas sem efeito recebem Investida." }] },
  "Campeão de Natureza": { faction: "Natureza", color: "#289455", style: "Marcadores de ação", evolution: "Distribua 10 marcadores de ação para o nível 2 e 20 marcadores para o nível 3.", plan: "Espalhe marcadores entre constantes e converta essa economia em controle de mesa.", abilities: [{ level: "I", type: "Ativa", text: "Uma vez por turno, dê 2 marcadores a até duas constantes aliadas." }, { level: "II", type: "Passiva", text: "Ao colocar marcadores, coloque um marcador adicional." }, { level: "III", type: "Ativa", text: "Remova 4 marcadores para virar uma criatura alvo." }] },
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
  const select = picker.querySelector<HTMLSelectElement>("select");
  const label = select?.selectedOptions?.[0]?.textContent?.trim() || "";
  const meta = heroMeta[label];
  if (!meta) return;
  picker.style.setProperty("--deck", meta.color);
  picker.style.setProperty("--faction-color", meta.color);
  picker.dataset.faction = meta.faction;

  const faction = picker.querySelector<HTMLElement>(":scope > b");
  const legacyStyle = picker.querySelector<HTMLElement>(":scope > small");
  if (faction) {
    faction.classList.add("deck-picker-faction");
    setTextIfChanged(faction, meta.faction);
  }
  if (legacyStyle) legacyStyle.hidden = true;

  let summary = picker.querySelector<HTMLElement>(".deck-picker-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.className = "deck-picker-summary";
    summary.append(createText("p", "deck-plan", ""));
    picker.append(summary);
  }
  summary.querySelector(".deck-evolution")?.remove();
  setTextIfChanged(summary.querySelector<HTMLElement>(".deck-plan"), meta.plan);
}

function enhanceDeckPickers() {
  document.querySelectorAll<HTMLElement>(".deck-picker").forEach(enrichDeckPicker);
}

function findHeroInspectorMeta(inspector: HTMLElement) {
  const heading = Array.from(inspector.querySelectorAll<HTMLElement>("h1,h2,h3")).find((node) => heroMeta[node.textContent?.trim() || ""]);
  if (!heading) return null;
  const name = heading.textContent?.trim() || "";
  return { heading, name, meta: heroMeta[name] };
}

function hideLegacyHeroInspectorSections(container: HTMLElement) {
  for (const node of Array.from(container.querySelectorAll<HTMLElement>("section,div"))) {
    const ownLabel = Array.from(node.children).find((child) => /^(EFEITO COMPLETO|PALAVRAS-CHAVE)$/i.test(child.textContent?.trim() || ""));
    if (ownLabel) node.classList.add("hero-inspector-legacy-section");
  }
}

function enhanceHeroInspector() {
  const inspector = document.querySelector<HTMLElement>(".inspector");
  if (!inspector) return;
  const found = findHeroInspectorMeta(inspector);
  if (!found) {
    inspector.classList.remove("hero-inspector-modern");
    inspector.querySelector(".hero-inspector-guide")?.remove();
    inspector.querySelectorAll(".hero-inspector-legacy-section").forEach((node) => node.classList.remove("hero-inspector-legacy-section"));
    return;
  }
  const { heading, name, meta } = found;
  inspector.classList.add("hero-inspector-modern");
  inspector.style.setProperty("--hero-faction", meta.color);
  const details = heading.parentElement;
  if (!details) return;
  hideLegacyHeroInspectorSections(details);

  let guide = details.querySelector<HTMLElement>(".hero-inspector-guide");
  if (guide?.dataset.hero === name) return;
  guide?.remove();
  guide = document.createElement("div");
  guide.className = "hero-inspector-guide";
  guide.dataset.hero = name;

  const identity = document.createElement("section");
  identity.className = "hero-guide-identity";
  identity.append(createText("small", "", "IDENTIDADE"), createText("strong", "hero-guide-faction", meta.faction), createText("span", "", meta.style), createText("p", "", meta.plan));

  const evolution = document.createElement("section");
  evolution.className = "hero-guide-evolution";
  evolution.append(createText("small", "", "EVOLUÇÃO"), createText("p", "", meta.evolution));

  const abilities = document.createElement("section");
  abilities.className = "hero-guide-abilities";
  abilities.append(createText("small", "", "HABILIDADES POR NÍVEL"));
  const list = document.createElement("div");
  for (const ability of meta.abilities) {
    const row = document.createElement("article");
    row.append(createText("i", "", ability.level), createText("b", ability.type === "Ativa" ? "is-active" : "is-passive", ability.type.toUpperCase()), createText("p", "", ability.text));
    list.append(row);
  }
  abilities.append(list);
  guide.append(identity, evolution, abilities);
  details.append(guide);
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

function passExpiredResponseWindow() {
  const dialog = document.querySelector<HTMLElement>(".response-dialog");
  if (!dialog) return;
  const timerNodes = Array.from(dialog.querySelectorAll<HTMLElement>("header *, .response-timer, .response-countdown"));
  const expired = timerNodes.some((node) => /^0s$/i.test((node.textContent || "").trim()));
  if (!expired) {
    delete dialog.dataset.timeoutPassDispatched;
    return;
  }
  if (dialog.dataset.timeoutPassDispatched === "true") return;
  const passButton = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.classList.contains("pass-response") || /passar prioridade/i.test(button.textContent || "")
  );
  if (!passButton || passButton.disabled) return;
  dialog.dataset.timeoutPassDispatched = "true";
  passButton.click();
}

function layoutTargetBannerInSafeLane() {
  const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
  const banner = board?.querySelector<HTMLElement>(":scope > .target-banner");
  if (!board || !banner) return;

  const boardRect = board.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height) return;

  const commandBars = Array.from(board.querySelectorAll<HTMLElement>(":scope > .hero-command-bar"))
    .filter((node) => node.getClientRects().length > 0)
    .map((node) => node.getBoundingClientRect());
  const creatureSlots = Array.from(board.querySelectorAll<HTMLElement>(".paired-field .creature-slot"))
    .filter((node) => node.getClientRects().length > 0)
    .map((node) => node.getBoundingClientRect());
  const terrains = Array.from(board.querySelectorAll<HTMLElement>(":scope > .terrain-slot"))
    .filter((node) => node.getClientRects().length > 0)
    .map((node) => node.getBoundingClientRect())
    .sort((a, b) => a.top - b.top);

  if (!commandBars.length || !creatureSlots.length || terrains.length < 2) return;

  // Horizontal safe lane: begins immediately after the command bars and ends
  // at the outer edge of the creature-space group. Because this lives in the
  // center row, it never covers the creature cards themselves.
  const leftPx = Math.max(...commandBars.map((rect) => rect.right));
  const rightPx = Math.max(...creatureSlots.map((rect) => rect.right));

  // Vertical safe lane: exactly the free interval between both Cruel Terrains.
  const topPx = terrains[0].bottom;
  const bottomPx = terrains[terrains.length - 1].top;

  const clampPct = (value: number) => Math.max(0, Math.min(100, value));
  const left = clampPct(((leftPx - boardRect.left) / boardRect.width) * 100);
  const right = clampPct(((rightPx - boardRect.left) / boardRect.width) * 100);
  const top = clampPct(((topPx - boardRect.top) / boardRect.height) * 100);
  const bottom = clampPct(((bottomPx - boardRect.top) / boardRect.height) * 100);

  if (right <= left || bottom <= top) return;
  banner.style.setProperty("--target-safe-left", left.toFixed(3) + "%");
  banner.style.setProperty("--target-safe-right", right.toFixed(3) + "%");
  banner.style.setProperty("--target-safe-top", top.toFixed(3) + "%");
  banner.style.setProperty("--target-safe-bottom", bottom.toFixed(3) + "%");
  banner.style.setProperty("--target-safe-center-x", ((left + right) / 2).toFixed(3) + "%");
  banner.style.setProperty("--target-safe-center-y", ((top + bottom) / 2).toFixed(3) + "%");
  banner.dataset.safeLaneMeasured = "true";
}

function layoutHandLimitChoices() {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(".maintenance, .maintenance-dialog, .engine-decision-panel"));
  const dialog = dialogs.find((node) => /LIMITE DE MÃO/i.test(node.textContent || ""));
  if (!dialog) return;
  dialog.classList.add("hand-limit-dialog");

  const grid = dialog.querySelector<HTMLElement>(".visual-card-choice-grid, .card-choice-grid, .decision-card-grid");
  if (!grid) return;
  grid.classList.add("hand-limit-choice-area");

  const items = Array.from(grid.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
  if (!items.length) return;
  const confirm = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((button) => /confirmar/i.test(button.textContent || ""));
  const dialogRect = dialog.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  const confirmRect = confirm?.getBoundingClientRect();
  const style = getComputedStyle(dialog);
  const horizontalPadding = parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
  const availableWidth = Math.max(1, dialogRect.width - horizontalPadding);
  const availableHeight = Math.max(1, (confirmRect ? confirmRect.top : dialogRect.bottom) - gridRect.top - Math.max(8, dialogRect.height * .025));
  const count = items.length;
  const gap = Math.max(6, Math.min(14, availableWidth * .018));
  const itemAspect = .64; // selectable tile width / height (card art + caption/padding)

  let bestColumns = 1;
  let bestWidth = 0;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const widthByRow = (availableWidth - gap * (columns - 1)) / columns;
    const heightPerItem = (availableHeight - gap * (rows - 1)) / rows;
    const widthByHeight = heightPerItem * itemAspect;
    const candidate = Math.min(widthByRow, widthByHeight);
    if (candidate > bestWidth) {
      bestWidth = candidate;
      bestColumns = columns;
    }
  }

  const maxReadable = Math.min(132, availableWidth / Math.min(count, 5));
  const fittedWidth = Math.max(44, Math.min(bestWidth, maxReadable));
  grid.style.setProperty("--hand-limit-cols", String(bestColumns));
  grid.style.setProperty("--hand-limit-item-w", fittedWidth.toFixed(2) + "px");
  grid.style.setProperty("--hand-limit-gap", gap.toFixed(2) + "px");
  grid.style.setProperty("--hand-limit-max-h", availableHeight.toFixed(2) + "px");
  grid.dataset.handLimitFit = "true";
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
      enhanceHeroInspector();
      enhanceMatchResult();
      layoutTargetBannerInSafeLane();
      layoutHandLimitChoices();
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
    window.addEventListener("resize", scheduleSync);
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    const responseTimeoutTimer = window.setInterval(passExpiredResponseWindow, 200);
    sync();
    return () => {
      window.clearInterval(responseTimeoutTimer);
      document.removeEventListener("change", onChange, true);
      window.removeEventListener("resize", scheduleSync);
      observer.disconnect();
      delete document.body.dataset.matchActive;
    };
  }, []);

  return null;
}

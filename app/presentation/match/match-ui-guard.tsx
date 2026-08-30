"use client";

import { useEffect } from "react";
import rawCards from "../../data/catalog/generated-card-catalog";
import { abilitiesForLevel, getExplicitCardRule } from "../../rules-engine/card-rules.mjs";

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

const normalizeChoiceText = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
const signedStat = (value: number) => value > 0 ? `+${value}` : `${value}`;
const durationSummary = (effect: any) => effect?.duration === "turn" ? " até o fim do turno" : effect?.duration === "permanent" ? " permanentemente" : effect?.duration === "untilNextTurn" ? " até o próximo turno" : "";

const summarizeChoiceEffect = (effect: any): string => {
  if (!effect || typeof effect !== "object") return "";
  const amount = Number(effect.amount ?? 1);
  switch (effect.type) {
    case "modifyStats": {
      const attack = Number(effect.attack || 0), health = Number(effect.health || 0), duration = durationSummary(effect);
      if (attack && health) return `${signedStat(attack)} Ofensividade e ${signedStat(health)} Vitalidade${duration}`;
      if (attack) return `${signedStat(attack)} Ofensividade${duration}`;
      if (health) return `${signedStat(health)} Vitalidade${duration}`;
      return "Ajustar atributos";
    }
    case "grantKeyword": return `Conceder ${effect.keyword || "palavra-chave"}${durationSummary(effect)}`;
    case "draw": return `Comprar ${amount} carta${amount === 1 ? "" : "s"}`;
    case "heal": return `Restaurar ${amount} de vida`;
    case "damage": return `Causar ${amount} de dano`;
    case "mill": return `Triturar ${amount} carta${amount === 1 ? "" : "s"}`;
    case "investigate": return `Investigar ${amount} carta${amount === 1 ? "" : "s"} do ${effect.target === "opponentDeck" ? "deck adversário" : "seu deck"}`;
    case "createImage": return `Criar ${effect.name || "uma Imagem"}`;
    case "createImagesAcrossFields": return `Criar ${amount} ${effect.name || "Imagem"}${amount === 1 ? "" : "s"}`;
    case "levelHero": return "Subir o herói de nível";
    case "payLifeCost": return `Pagar ${amount} de vida`;
    case "loseLife": return `Perder ${amount} de vida`;
    case "search": {
      const kind = effect.name || effect.subtype || (Array.isArray(effect.types) ? effect.types.join(" ou ") : "carta");
      const cost = effect.minCost != null ? ` de custo ${effect.minCost} ou mais` : effect.maxCost != null ? ` de custo até ${effect.maxCost}` : "";
      return `Buscar ${amount} ${kind}${cost}`;
    }
    case "gainEnergy": return `Ganhar ${amount} de energia${effect.destination === "reserve" ? " de Reserva" : ""}`;
    case "fillReserve": return "Preencher a Reserva";
    case "tap": return "Virar o alvo";
    case "ready": return "Desvirar o alvo";
    case "destroy": return effect.target === "self" ? "Destruir esta carta" : "Destruir o alvo";
    case "returnToHand": return "Retornar o alvo à mão";
    case "moveTopToBottom": return "Mover o topo para o fundo";
    case "addMarker": return `Adicionar ${amount} marcador${amount === 1 ? "" : "es"}${effect.marker ? ` de ${effect.marker}` : ""}`;
    case "removeMarker": return `Remover ${amount} marcador${amount === 1 ? "" : "es"}`;
    case "selectFirstAct": return `Ativar Primeiro Ato${effect.name ? ` de ${effect.name}` : ""}`;
    default: return "";
  }
};

type ChoiceSet = { choices: any[][]; labels?: string[] };
type CardChoiceSummary = { name: string; normalizedName: string; sets: ChoiceSet[] };

const collectChoiceSets = (effects: any[] = [], output: ChoiceSet[] = []) => {
  for (const effect of effects || []) {
    if (!effect || typeof effect !== "object") continue;
    if (Array.isArray(effect.choices) && effect.choices.length && effect.choices.every((choice: unknown) => Array.isArray(choice))) {
      output.push({ choices: effect.choices, labels: Array.isArray(effect.labels) ? effect.labels : undefined });
    }
    if (Array.isArray(effect.effects)) collectChoiceSets(effect.effects, output);
    for (const branch of effect.branches || []) if (Array.isArray(branch?.effects)) collectChoiceSets(branch.effects, output);
  }
  return output;
};

const cardChoiceSummaries: CardChoiceSummary[] = (rawCards as Array<{ id: string; name: string }>).flatMap((card) => {
  const rule = getExplicitCardRule(card.id);
  const abilities = abilitiesForLevel(rule, 3) || [];
  const sets = abilities.flatMap((ability: any) => collectChoiceSets(ability?.effects || []));
  return sets.length ? [{ name: card.name, normalizedName: normalizeChoiceText(card.name), sets }] : [];
}).sort((a, b) => b.normalizedName.length - a.normalizedName.length);

let recentChoiceSourceName = "";

function rememberChoiceSource(event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".screen-game")) return;
  const directCard = target.closest<HTMLElement>(".original-card");
  const activationCard = target.closest<HTMLElement>(".card-frame-activation")?.closest<HTMLElement>(".card-frame")?.querySelector<HTMLElement>(".original-card");
  const source = directCard || activationCard;
  const name = source?.getAttribute("aria-label")?.trim();
  if (name) recentChoiceSourceName = name;
}

function enhanceDecisionChoiceSummaries() {
  document.querySelectorAll<HTMLElement>(".engine-decision-panel").forEach((panel) => {
    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).filter((button) => {
      const number = button.querySelector<HTMLElement>(":scope > b")?.textContent?.trim() || "";
      return /^\d+$/.test(number) && !!button.querySelector<HTMLElement>(":scope > span");
    });
    if (!buttons.length) return;

    const panelText = normalizeChoiceText(panel.textContent);
    const recentSource = normalizeChoiceText(recentChoiceSourceName);
    const card = cardChoiceSummaries.find((candidate) => candidate.normalizedName && panelText.includes(candidate.normalizedName))
      || cardChoiceSummaries.find((candidate) => recentSource && candidate.normalizedName === recentSource);
    if (!card) return;
    const set = card.sets.find((candidate) => candidate.choices.length === buttons.length);
    if (!set) return;

    panel.dataset.choiceSource = card.name;
    buttons.forEach((button, index) => {
      const explicit = set.labels?.[index]?.trim();
      const generated = (set.choices[index] || []).map(summarizeChoiceEffect).filter(Boolean).join(" · ");
      const summary = explicit || generated;
      if (!summary) return;
      setTextIfChanged(button.querySelector<HTMLElement>(":scope > span"), summary);
      button.title = summary;
      button.dataset.effectSummary = "true";
      button.dataset.effectDensity = summary.length > 78 ? "dense" : summary.length > 44 ? "compact" : "normal";
    });
  });
}

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

  const leftPx = Math.max(...commandBars.map((rect) => rect.right));
  const rightPx = Math.max(...creatureSlots.map((rect) => rect.right));
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
  const itemAspect = .64;

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
      enhanceDecisionChoiceSummaries();
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
    document.addEventListener("pointerdown", rememberChoiceSource, true);
    document.addEventListener("dragstart", rememberChoiceSource, true);
    window.addEventListener("resize", scheduleSync);
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    const responseTimeoutTimer = window.setInterval(passExpiredResponseWindow, 200);
    sync();
    return () => {
      window.clearInterval(responseTimeoutTimer);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("pointerdown", rememberChoiceSource, true);
      document.removeEventListener("dragstart", rememberChoiceSource, true);
      window.removeEventListener("resize", scheduleSync);
      observer.disconnect();
      delete document.body.dataset.matchActive;
    };
  }, []);

  return null;
}

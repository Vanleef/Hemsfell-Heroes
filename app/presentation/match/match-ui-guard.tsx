"use client";

import { useEffect } from "react";
import rawCards from "../../data/catalog/generated-card-catalog";
import { abilitiesForLevel, getExplicitCardRule } from "../../rules-engine/card-rules.mjs";

const setTextIfChanged = (node: HTMLElement | null, text: string) => {
  if (node && node.textContent !== text) node.textContent = text;
};
const normalizeChoiceText = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, " ")
  .trim()
  .toLowerCase();
const signedStat = (value: number) => value > 0 ? `+${value}` : `${value}`;
const durationSummary = (effect: any) => effect?.duration === "turn"
  ? " até o fim do turno"
  : effect?.duration === "permanent"
    ? " permanentemente"
    : effect?.duration === "untilNextTurn"
      ? " até o próximo turno"
      : "";

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
  const activationCard = target.closest<HTMLElement>(".card-frame-activation")
    ?.closest<HTMLElement>(".card-frame")
    ?.querySelector<HTMLElement>(".original-card");
  const name = (directCard || activationCard)?.getAttribute("aria-label")?.trim();
  if (name) recentChoiceSourceName = name;
}

function enhanceDecisionChoiceSummaries(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".engine-decision-panel").forEach((panel) => {
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

function clearOrphanedMatchUi() {
  document.querySelectorAll(".engine-decision-backdrop,.defense-decision,.target-banner,.response-waiting,.match-reconnect-overlay,.priority-stack-indicator,.visual-effect,.deck-shuffle-effect,.combat-cinematic")
    .forEach((node) => node.remove());
}

function layoutTargetBannerInSafeLane() {
  const board = document.querySelector<HTMLElement>(".screen-game .game-content.hs-board");
  const banner = board?.querySelector<HTMLElement>(":scope > .target-banner");
  if (!board || !banner) return;

  const boardRect = board.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height) return;
  const commandBars = Array.from(board.querySelectorAll<HTMLElement>(".hero-panel-stack > .hero-command-bar"))
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
  const root = document.querySelector<HTMLElement>("main.hh-app.screen-game");
  if (!root) return;
  const dialogs = Array.from(root.querySelectorAll<HTMLElement>(".maintenance, .maintenance-dialog, .engine-decision-panel"));
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
    const candidate = Math.min(widthByRow, heightPerItem * itemAspect);
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

function initializePortraitBoardPan() {
  const stage = document.querySelector<HTMLElement>(".screen-game .game-stage");
  if (!stage) return;
  const portrait = window.matchMedia("(orientation: portrait) and (max-width: 60rem)").matches;
  if (!portrait) {
    delete stage.dataset.hhPanInitialized;
    return;
  }
  if (stage.dataset.hhPanInitialized) return;
  stage.dataset.hhPanInitialized = "pending";
  requestAnimationFrame(() => {
    if (!stage.isConnected) return;
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
    stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
    stage.dataset.hhPanInitialized = "true";
  });
}

export default function MatchUiGuard() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("main.hh-app.screen-game");
    if (!root) return;
    document.body.dataset.matchActive = "true";
    let syncFrame = 0;

    const sync = () => {
      syncFrame = 0;
      if (!root.isConnected) return;
      enhanceDecisionChoiceSummaries(root);
      layoutTargetBannerInSafeLane();
      layoutHandLimitChoices();
      initializePortraitBoardPan();
    };
    const scheduleSync = () => {
      if (!syncFrame) syncFrame = requestAnimationFrame(sync);
    };
    const mutationTouchesManagedUi = (record: MutationRecord) => {
      const selector = ".game-stage,.engine-decision-panel,.maintenance,.maintenance-dialog,.target-banner,.inspector";
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest(selector)) return true;
      if (record.type !== "childList") return false;
      return [...record.addedNodes, ...record.removedNodes].some((node) =>
        node instanceof Element && (node.matches(selector) || !!node.querySelector(selector)),
      );
    };

    root.addEventListener("pointerdown", rememberChoiceSource, true);
    root.addEventListener("dragstart", rememberChoiceSource, true);
    window.addEventListener("resize", scheduleSync);
    const observer = new MutationObserver((records) => {
      if (records.some(mutationTouchesManagedUi)) scheduleSync();
    });
    observer.observe(root, { childList: true, subtree: true });
    sync();

    return () => {
      if (syncFrame) cancelAnimationFrame(syncFrame);
      root.removeEventListener("pointerdown", rememberChoiceSource, true);
      root.removeEventListener("dragstart", rememberChoiceSource, true);
      window.removeEventListener("resize", scheduleSync);
      observer.disconnect();
      clearOrphanedMatchUi();
      document.querySelector<HTMLButtonElement>(".inspector-close")?.click();
      delete document.body.dataset.matchActive;
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";
import "../styles/cross-screen-ui.css";

type CrossScreenMode = "menu" | "setup";
type HeroPickerMeta = { faction: string; color: string; plan: string };

const HERO_PICKER_META: Record<string, HeroPickerMeta> = {
  "Gimble, Presenteado Sortudo": { faction: "Natureza", color: "#2d9a58", plan: "Faça Dragões crescerem, recicle valor quando eles saem do campo e domine a mesa no jogo longo." },
  "Sr. Goblin, o Mercador": { faction: "Caos", color: "#8d45ce", plan: "Encadeie cartas baratas, Fura-Fila e Goblins para transformar volume em compra e tempo." },
  "Uruk, a Encantriz": { faction: "Divino", color: "#378ed0", plan: "Alterne elementos, prepare efeitos adicionais e converta sequências de feitiços em controle." },
  "Tifon, a Peste": { faction: "Neutro", color: "#777d86", plan: "Use Último Suspiro e sacrifícios para transformar perdas planejadas em vantagem inevitável." },
  "Saymon, o Primeiro": { faction: "Neutro", color: "#777d86", plan: "Trate a própria vida como recurso, estabilizando a partida com Vampiros e Roubo de Vida." },
  "Tessália, a Mão de Ferro": { faction: "Ordem", color: "#d54a45", plan: "Construa uma formação em torno do Comandante e pressione o combate com proteção e substituições." },
  "Quarion Siannodel": { faction: "Ordem", color: "#c84642", plan: "Extraia valor de entradas em campo, recupere criaturas e reutilize seus melhores Primeiros Atos." },
  "Rasmus, Barista do Tempo": { faction: "Divino", color: "#378ed0", plan: "Acumule Cafés, espalhe Gatos e converta presença de mesa em cura e utilidade flexível." },
  "Rasmus, o Barista do Tempo": { faction: "Divino", color: "#378ed0", plan: "Acumule Cafés, espalhe Gatos e converta presença de mesa em cura e utilidade flexível." },
  "Ngoro, o Investigador": { faction: "Caos", color: "#7949b5", plan: "Investigue decks, gere Pistas e gaste informação para comprar, triturar ou preparar ataques furtivos." },
  "Zayan, a Revolucionária": { faction: "Ordem", color: "#cf4c45", plan: "Valorize criaturas simples com bônus de combate, substituições e Investida." },
  "Campeão de Natureza": { faction: "Natureza", color: "#289455", plan: "Espalhe marcadores entre constantes e converta essa economia em controle de mesa." },
};

const setTextIfChanged = (node: HTMLElement | null, text: string) => {
  if (node && node.textContent !== text) node.textContent = text;
};

function ensureLandingGuide(root: HTMLElement) {
  const copy = root.querySelector<HTMLElement>(".landing-copy");
  if (!copy || copy.querySelector(".landing-mode-guide")) return;
  const guide = document.createElement("div");
  guide.className = "landing-mode-guide";
  const items = [
    ["⚔", "Duelo tático", "Reduza a vida do herói rival a zero usando criaturas, feitiços, artefatos e decisões de combate."],
    ["◆", "Contra IA", "Ideal para testar decks e aprender interações, com dificuldade ajustável antes da partida."],
    ["◎", "Multiplayer", "Crie uma sala privada, compartilhe o convite e enfrente outro jogador com estado autoritativo."],
    ["✦", "Heróis e coleção", "Compare arquétipos, evolução, poderes e listas completas antes de escolher seu deck."],
  ] as const;
  for (const [icon, title, detail] of items) {
    const article = document.createElement("article");
    const glyph = document.createElement("i");
    const heading = document.createElement("b");
    const copyNode = document.createElement("span");
    glyph.textContent = icon;
    heading.textContent = title;
    copyNode.textContent = detail;
    article.append(glyph, heading, copyNode);
    guide.append(article);
  }
  copy.append(guide);
}

function enrichDeckPicker(picker: HTMLElement) {
  const select = picker.querySelector<HTMLSelectElement>("select");
  const label = select?.selectedOptions?.[0]?.textContent?.trim() || "";
  const meta = HERO_PICKER_META[label];
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

  let summary = picker.querySelector<HTMLElement>(":scope > .deck-picker-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.className = "deck-picker-summary";
    const plan = document.createElement("p");
    plan.className = "deck-plan";
    summary.append(plan);
    picker.append(summary);
  }
  setTextIfChanged(summary.querySelector<HTMLElement>(":scope > .deck-plan"), meta.plan);
}

function nodeTouchesDeckPicker(node: Node) {
  return node instanceof Element && (node.matches(".deck-picker") || !!node.querySelector(".deck-picker"));
}

export default function CrossScreenUiRuntime({ mode }: { mode: CrossScreenMode }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(mode === "menu" ? "main.hh-app.screen-menu" : "main.hh-app.screen-setup");
    if (!root) return;
    if (mode === "menu") {
      ensureLandingGuide(root);
      return;
    }

    let frame = 0;
    const sync = () => {
      frame = 0;
      if (!root.isConnected) return;
      root.querySelectorAll<HTMLElement>(".deck-picker").forEach(enrichDeckPicker);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    const onChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.closest(".deck-picker")) schedule();
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => [...record.addedNodes, ...record.removedNodes].some(nodeTouchesDeckPicker))) schedule();
    });
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("change", onChange, true);
    sync();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("change", onChange, true);
    };
  }, [mode]);

  return null;
}

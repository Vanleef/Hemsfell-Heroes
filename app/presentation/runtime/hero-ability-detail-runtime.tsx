"use client";

import { useEffect } from "react";

type AbilityDetail = {
  kind: "ATIVA" | "PASSIVA";
  text: string;
};

type AbilityTriplet = readonly [AbilityDetail, AbilityDetail, AbilityDetail];

const HERO_ABILITY_DETAILS: Record<string, AbilityTriplet> = {
  gimble: [
    { kind: "PASSIVA", text: "Quando uma Criatura da classe Dragão deixa o campo, cure 1 de vida." },
    { kind: "ATIVA", text: "Uma vez por turno, você pode desvirar uma Criatura da classe Dragão no seu campo." },
    { kind: "PASSIVA", text: "No início da sua Manutenção, suas Criaturas da classe Dragão em campo recebem um marcador +1/+1." },
  ],
  goblin: [
    { kind: "PASSIVA", text: "Quando um Goblin deixar o campo, compre 1 carta. Limite de 1 vez por turno." },
    { kind: "PASSIVA", text: "Na sua Manutenção, compre 1 carta adicional." },
    { kind: "PASSIVA", text: "Seu primeiro Goblin invocado no turno custa 0." },
  ],
  uruk: [
    { kind: "PASSIVA", text: "Fim do turno: ative o efeito do elemento do último Feitiço conjurado neste turno. Fogo: 1 de dano a um alvo; Terra: compre 1 carta; Água: restaure 1 de vida; Ar: receba 1 de Energia." },
    { kind: "PASSIVA", text: "O primeiro Feitiço conjurado por você no turno custa 1 a menos de Energia." },
    { kind: "PASSIVA", text: "O último Feitiço conjurado por você no turno é duplicado." },
  ],
  tifon: [
    { kind: "PASSIVA", text: "Durante o seu turno, quando uma criatura sua morrer, você pode comprar 1 carta. Máx. 3 por turno." },
    { kind: "PASSIVA", text: "Sempre que uma criatura sua com Último Suspiro morrer, cause 1 de dano ao herói inimigo." },
    { kind: "PASSIVA", text: "Suas criaturas ativam seu Último Suspiro duas vezes." },
  ],
  saymon: [
    { kind: "ATIVA", text: "Pague 2 de vida: no seu turno, cause 1 de dano a um alvo. Limite de 1 vez por turno." },
    { kind: "ATIVA", text: "Pague 2 de vida: conceda Roubo de Vida a uma criatura. Limite de 1 vez por turno." },
    { kind: "PASSIVA", text: "Seus efeitos que custam vida não podem deixar sua vida abaixo de 1." },
  ],
  tessalia: [
    { kind: "PASSIVA", text: "Seu Comandante recebe +2 de Ofensividade. Sem um Comandante, suas outras criaturas não podem atacar." },
    { kind: "PASSIVA", text: "Seu Comandante recebe +3 de Ofensividade e Atropelar." },
    { kind: "PASSIVA", text: "Uma vez por turno, outra criatura pode ser destruída no lugar do seu Comandante." },
  ],
  quarion: [
    { kind: "PASSIVA", text: "Quando um Primeiro Ato seu for ativado, compre 1 carta. Limite de 1 vez por turno." },
    { kind: "PASSIVA", text: "A primeira criatura sua que morrer no seu turno retorna para sua mão." },
    { kind: "PASSIVA", text: "O primeiro Primeiro Ato ativado por você no turno é ativado novamente." },
  ],
  rasmus: [
    { kind: "PASSIVA", text: "Após usar 10 efeitos com Café no nome, crie uma Imagem de Café Especial em sua mão." },
    { kind: "PASSIVA", text: "Sempre que um Gato causar dano à vida de um jogador, cure 1 de vida." },
    { kind: "PASSIVA", text: "Criaturas Gato podem ocupar espaços de Criatura e de Não Criatura. Em espaço de Não Criatura, não podem receber Artefato." },
  ],
  ngoro: [
    { kind: "PASSIVA", text: "Sempre que você Investigar, ganhe 1 Pista. Na sua Manutenção, escolha um deck e Investigue 1." },
    { kind: "ATIVA", text: "Gaste 2 Pistas: compre 1 carta ou faça o oponente Triturar 2." },
    { kind: "ATIVA", text: "Gaste 3 Pistas: dê Furtivo a uma criatura aliada até o fim do turno." },
  ],
  zayan: [
    { kind: "PASSIVA", text: "No combate, uma criatura sem efeito recebe +1/+1 até o fim do turno." },
    { kind: "PASSIVA", text: "Outra criatura pode ser destruída no lugar de uma criatura sua sem efeito." },
    { kind: "PASSIVA", text: "Suas criaturas sem efeito recebem Investida." },
  ],
  natureza: [
    { kind: "ATIVA", text: "Uma vez por turno, coloque 2 marcadores de ação em até duas constantes aliadas." },
    { kind: "PASSIVA", text: "Sempre que colocar marcadores de ação, coloque 1 marcador adicional." },
    { kind: "ATIVA", text: "Remova 4 marcadores de ação das suas constantes: vire uma criatura alvo." },
  ],
};

const PANEL_SELECTOR = ".screen-game .hero-panel-stack.canonical-hero-panel";
const CHIP_SELECTOR = ".hero-command-bar .hero-ability-chip";

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

function syncPanel(panel: HTMLElement) {
  const heroKey = heroKeyForPanel(panel);
  const details = HERO_ABILITY_DETAILS[heroKey];
  if (!details) return;

  Array.from(panel.querySelectorAll<HTMLButtonElement>(CHIP_SELECTOR)).slice(0, 3).forEach((chip, slot) => {
    const detail = details[slot];
    if (!detail) return;
    const next = `${detail.kind} · NÍVEL ${slot + 1}\n${detail.text}`;
    if (chip.dataset.abilityTooltip !== next) chip.dataset.abilityTooltip = next;
    chip.dataset.abilityDetailSource = "hero-card-text";
  });
}

function syncAll() {
  document.querySelectorAll<HTMLElement>(PANEL_SELECTOR).forEach(syncPanel);
}

export default function HeroAbilityDetailRuntime() {
  useEffect(() => {
    syncAll();
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => record.type === "childList" && (record.addedNodes.length || record.removedNodes.length))) return;
      syncAll();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

type AbilityDetail = {
  kind: "ATIVA" | "PASSIVA";
  text: string;
};

type AbilityTriplet = readonly [AbilityDetail, AbilityDetail, AbilityDetail];

const HERO_ABILITY_DETAILS: Record<string, AbilityTriplet> = {
  gimble: [
    { kind: "PASSIVA", text: "Sempre que uma Criatura da classe Dragão que você controla deixa o campo, seu herói recupera 1 de vida. O efeito é automático e pode disparar novamente para cada saída válida de Dragão." },
    { kind: "ATIVA", text: "Uma vez por turno, escolha um Dragão aliado que esteja virado/exaurido e desvire-o. A habilidade não exige gasto de Energia e só pode ser usada quando houver um Dragão aliado válido para desvirar." },
    { kind: "PASSIVA", text: "No início da sua Manutenção, cada Dragão aliado em campo recebe um marcador +1/+1, aumentando sua Ofensividade e Vitalidade em +1/+1. Dragões que permanecerem em campo podem receber novos marcadores em manutenções futuras." },
  ],
  goblin: [
    { kind: "PASSIVA", text: "Quando um Goblin que você controla deixa o campo, compre 1 carta. Esta habilidade só pode conceder essa compra uma vez por turno; novas perdas de Goblins no mesmo turno não compram cartas adicionais por esta habilidade." },
    { kind: "PASSIVA", text: "Durante a sua Manutenção, compre automaticamente 1 carta adicional além da compra normal da etapa. Essa compra extra acontece sempre que sua Manutenção for resolvida enquanto esta habilidade estiver liberada." },
    { kind: "PASSIVA", text: "O primeiro Goblin que você invocar em cada turno custa 0 de Energia. Depois que esse benefício for consumido, os demais Goblins do turno voltam a usar seus custos normais, considerando outros modificadores aplicáveis." },
  ],
  uruk: [
    { kind: "PASSIVA", text: "No fim do seu turno, ative automaticamente o elemento do último Feitiço que você conjurou. Terra: compre 1 carta. Água: cure 1 de vida do seu herói. Ar: ganhe 1 de Energia principal. Fogo: escolha qualquer personagem válido e cause 1 de dano a ele. Se nenhum Feitiço com elemento tiver sido registrado, não há efeito para resolver." },
    { kind: "PASSIVA", text: "O primeiro Feitiço que você conjurar em cada turno custa 1 de Energia a menos. A redução é aplicada ao custo do Feitiço antes do pagamento e vale somente para o primeiro Feitiço daquele turno." },
    { kind: "PASSIVA", text: "No fim do seu turno, repita automaticamente o último Feitiço que você conjurou naquele turno sem pagar novamente o custo original. Se o Feitiço exigir alvos ou escolhas, faça novas seleções válidas para a cópia; se não houver uma resolução legal, a repetição é ignorada." },
  ],
  tifon: [
    { kind: "PASSIVA", text: "A primeira vez em cada um dos seus turnos que uma criatura aliada for destruída, compre 1 carta. Depois que a compra ocorrer, outras mortes aliadas no mesmo turno não ativam novamente esta habilidade." },
    { kind: "PASSIVA", text: "Sempre que uma criatura aliada que possua Último Suspiro for destruída, cause 1 de dano ao herói inimigo. A habilidade verifica se a criatura destruída realmente tinha um efeito de Último Suspiro." },
    { kind: "PASSIVA", text: "Os efeitos de Último Suspiro das suas cartas são resolvidos duas vezes. Quando um Último Suspiro aliado é disparado, sua resolução é repetida automaticamente, mantendo as regras e alvos válidos daquele efeito." },
  ],
  saymon: [
    { kind: "ATIVA", text: "Uma vez por turno, pague 2 de vida para causar 1 de dano a um alvo válido. Você pode escolher uma criatura ou o herói inimigo, mas não pode escolher o próprio herói como alvo desse dano." },
    { kind: "ATIVA", text: "Uma vez por turno, pague 2 de vida e escolha uma criatura aliada. Ela recebe Roubo de Vida permanentemente, mantendo a palavra-chave enquanto permanecer como a mesma unidade em campo." },
    { kind: "PASSIVA", text: "Custos que exigem pagamento de vida não podem reduzir sua vida abaixo de 1. Se um custo de vida não puder ser pago respeitando esse mínimo, a ação não pode ser realizada; dano e outras perdas de vida continuam seguindo suas próprias regras." },
  ],
  tessalia: [
    { kind: "PASSIVA", text: "A criatura no espaço central do seu campo é o seu Comandante. Enquanto houver um Comandante válido nesse espaço, ele recebe +2 de Ofensividade; sem um Comandante central você não pode declarar ataques. Cada ataque declarado com o Comandante também conta para a evolução de Tessália." },
    { kind: "PASSIVA", text: "Seu Comandante central recebe o bônus ofensivo do nível II (+3 de Ofensividade) e ganha Atropelar. O efeito permanece ligado à criatura que estiver ocupando corretamente o espaço central de Comandante." },
    { kind: "PASSIVA", text: "Uma vez por turno, quando o seu Comandante seria destruído em combate, outra criatura aliada pode ser destruída no lugar dele. A substituição preserva o Comandante e consome a proteção daquele turno." },
  ],
  quarion: [
    { kind: "PASSIVA", text: "A primeira vez em cada turno que um Primeiro Ato seu for resolvido, compre 1 carta. Outros Primeiros Atos resolvidos no mesmo turno continuam funcionando normalmente, mas não concedem outra compra por esta habilidade." },
    { kind: "PASSIVA", text: "Uma vez por turno, durante o seu turno, a primeira criatura aliada que iria para o cemitério é devolvida para a sua mão em vez disso. Depois dessa substituição, outras criaturas seguem normalmente para seus destinos." },
    { kind: "PASSIVA", text: "O primeiro Primeiro Ato que você resolver em cada turno é ativado uma segunda vez. A segunda resolução repete o efeito daquele Primeiro Ato e respeita novamente suas exigências de alvo e demais condições aplicáveis." },
  ],
  rasmus: [
    { kind: "PASSIVA", text: "Sempre que você conjurar um Feitiço Café, coloque 1 marcador de Café em Rasmus. Ao atingir 10 marcadores, os 10 são consumidos e uma imagem de Café Especial é criada na sua mão; a contagem então pode começar novamente." },
    { kind: "PASSIVA", text: "Sempre que um Gato sob seu controle causar dano a um jogador, cure 1 de vida do seu herói. O efeito considera dano causado diretamente a um jogador por uma fonte que possua o subtipo Gato." },
    { kind: "PASSIVA", text: "Criaturas Gato também podem ocupar espaços auxiliares, inclusive nos campos em que essa regra estiver habilitada. Nesses espaços elas continuam contando como Criaturas, mas não podem receber Artefatos como se fossem uma criatura em espaço de criatura." },
  ],
  ngoro: [
    { kind: "PASSIVA", text: "Sempre que você Investigar, ganhe 1 Pista. Além disso, durante a sua Manutenção, escolha um dos decks e Investigue 1 carta dele. As Pistas acumuladas são o recurso usado pelas habilidades seguintes e também contam para a evolução de Ngoro." },
    { kind: "ATIVA", text: "Remova 2 Pistas e escolha um dos dois efeitos: comprar 1 carta, ou fazer o oponente triturar as 2 cartas do topo do próprio deck. A habilidade pode ser usada sempre que você tiver Pistas suficientes e a ativação for legal." },
    { kind: "ATIVA", text: "Remova 3 Pistas e escolha uma criatura aliada. Ela recebe Furtivo até o fim do turno, podendo aproveitar a palavra-chave imediatamente conforme as regras de Furtivo." },
  ],
  zayan: [
    { kind: "PASSIVA", text: "No início do combate, escolha uma criatura sem texto de efeito. Ela recebe +1 de Ofensividade e +1 de Vitalidade até o fim do turno. Apenas criaturas consideradas sem efeito são válidas para esse bônus." },
    { kind: "PASSIVA", text: "Quando uma criatura sua sem texto de efeito seria destruída, outra criatura aliada pode ser destruída no lugar dela. A substituição protege a criatura sem efeito usando outra criatura como custo da destruição substituta." },
    { kind: "PASSIVA", text: "Todas as suas criaturas sem texto de efeito recebem Investida enquanto permanecerem elegíveis para esta habilidade. Isso permite que ataquem no mesmo turno em que entram em campo, seguindo as demais restrições de combate." },
  ],
  natureza: [
    { kind: "ATIVA", text: "Uma vez por turno, escolha uma ou duas constantes aliadas e coloque 2 marcadores de ação em cada alvo escolhido. A habilidade precisa de pelo menos uma constante aliada válida para ser ativada." },
    { kind: "PASSIVA", text: "Sempre que você colocar marcadores de ação por um efeito seu, coloque 1 marcador de ação adicional. O marcador extra acompanha cada aplicação válida de marcadores feita pelo seu lado." },
    { kind: "ATIVA", text: "Remova um total de 4 marcadores de ação das suas constantes como custo e escolha qualquer criatura válida. Vire essa criatura. A habilidade pode ser usada novamente se você ainda puder pagar outros 4 marcadores e houver um alvo válido." },
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
    chip.dataset.abilityDetailSource = "canonical-rules";
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

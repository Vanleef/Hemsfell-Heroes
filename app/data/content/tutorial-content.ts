import {
  GAME_GLOSSARY,
  type GameGlossaryEntry,
  type GameGlossaryTone,
} from "./game-glossary";

export type TutorialViewId = "guide" | "glossary";
export type TutorialChapterId = "first-duel" | "cards" | "board" | "turn" | "combat";
export type GlossaryRangeId = "all" | "symbols-d" | "e-l" | "m-s" | "t-z";

export type TutorialReference = {
  title: string;
  description: string;
  badge?: string;
};

export type TutorialKeyword = TutorialReference & {
  tone: GameGlossaryTone;
};

export type TutorialGlossaryEntry = GameGlossaryEntry & {
  key: string;
};

export const TUTORIAL_VIEWS: Array<{ id: TutorialViewId; label: string }> = [
  { id: "guide", label: "Como jogar" },
  { id: "glossary", label: "Glossário" },
];

export const TUTORIAL_CHAPTERS: Array<{
  id: TutorialChapterId;
  label: string;
  description: string;
}> = [
  { id: "first-duel", label: "Seu primeiro duelo", description: "Objetivo e recursos" },
  { id: "cards", label: "Leia uma carta", description: "Custos, tipos e atributos" },
  { id: "board", label: "Conheça o campo", description: "Zonas e posicionamento" },
  { id: "turn", label: "Jogue seu turno", description: "Etapas e comandos" },
  { id: "combat", label: "Entre em combate", description: "Ataque, defesa e dano" },
];

export const GLOSSARY_RANGES: Array<{ id: GlossaryRangeId; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "symbols-d", label: "#–D" },
  { id: "e-l", label: "E–L" },
  { id: "m-s", label: "M–S" },
  { id: "t-z", label: "T–Z" },
];

export const QUICK_FACTS: TutorialReference[] = [
  { title: "Vida", description: "Reduza a Vida do Herói inimigo a 0 para vencer.", badge: "30" },
  { title: "Deck Principal", description: "Seu deck de partida contém 49 cartas válidas.", badge: "49" },
  { title: "Mão inicial", description: "Você começa com 7 cartas antes do mulligan.", badge: "7" },
  { title: "Reserva", description: "Guarda até 3 de Energia para respostas e efeitos permitidos.", badge: "3" },
];

export const CARD_ANATOMY: TutorialReference[] = [
  { title: "Custo", description: "A Energia necessária para jogar a carta.", badge: "1" },
  { title: "Ofensividade", description: "O dano que a criatura causa em combate.", badge: "2" },
  { title: "Vitalidade", description: "O dano que a criatura suporta antes de ser destruída.", badge: "3" },
  { title: "Tipo e subtipo", description: "Indicam a categoria da carta e grupos como Dragão, Goblin ou Recruta.", badge: "4" },
  { title: "Nome e descrição", description: "O painel informa o nome, as condições, os alvos e os efeitos da carta.", badge: "5" },
];

export const TURN_STEPS: TutorialReference[] = [
  { title: "Manutenção", description: "Prepare suas cartas, resolva gatilhos e receba os recursos do turno." },
  { title: "Principal", description: "Jogue cartas, escolha alvos e use habilidades disponíveis." },
  { title: "Combate", description: "Escolha uma criatura para atacar; o defensor responde e decide o bloqueio." },
  { title: "Finalização", description: "Resolva efeitos finais, guarde Energia na Reserva e passe o turno." },
];

export const BASIC_COMMANDS: TutorialReference[] = [
  { title: "Hover por 1s", description: "Mostra o resumo da carta." },
  { title: "Segurar por 1s", description: "Abre a inspeção detalhada da carta." },
  { title: "Arrastar", description: "Joga a carta em uma zona válida." },
  { title: "Clique", description: "Escolhe alvos, cartas e opções destacadas." },
  { title: "Habilidade", description: "Ativa uma habilidade disponível da carta." },
  { title: "Passar", description: "Devolve a prioridade ou avança quando a interface permitir." },
];

export const BOARD_ZONES: TutorialReference[] = [
  { title: "Herói", description: "Mostra Vida, nível, evolução e habilidades disponíveis.", badge: "30 Vida" },
  { title: "Deck e Mão", description: "O Deck compra cartas; a Mão guarda suas opções atuais.", badge: "Privado" },
  { title: "Cemitério e Obscuro", description: "O Cemitério recebe cartas descartadas, destruídas e Feitiços resolvidos. O Obscuro recebe cartas banidas.", badge: "Públicos" },
  { title: "Deck Extra", description: "Guarda Imagens acessadas por efeitos específicos.", badge: "Imagens" },
];

export const COMBAT_STEPS: TutorialReference[] = [
  { title: "1. Escolha quem ataca", description: "Selecione uma criatura pronta e apta para atacar." },
  { title: "2. Responda", description: "A prioridade permite Acelerados e outras respostas legais antes da continuação." },
  { title: "3. Defenda", description: "O defensor escolhe um bloqueador legal ou aceita o ataque sem bloqueio." },
  { title: "4. Resolva o dano", description: "Atacante e bloqueador causam dano conforme as regras e palavras-chave aplicáveis." },
];

export const CARD_TYPES: TutorialReference[] = [
  { title: "Criatura", description: "Permanece no campo e possui Ofensividade e Vitalidade." },
  { title: "Feitiço", description: "Resolve o efeito e normalmente vai ao Cemitério." },
  { title: "Artefato", description: "Constante auxiliar normalmente vinculada a uma criatura." },
  { title: "Encanto", description: "Constante auxiliar com efeito contínuo, gatilhado ou ativável." },
  { title: "Terreno", description: "Ocupa a zona de Terreno Cruel." },
  { title: "Imagem", description: "Carta do Deck Extra colocada no jogo por efeitos." },
];

const keyword = (key: string): TutorialKeyword => {
  const entry = GAME_GLOSSARY[key];
  if (!entry) throw new Error(`Tutorial keyword missing from GAME_GLOSSARY: ${key}`);
  return { title: entry.label, description: entry.description, tone: entry.tone };
};

// Estes termos formam o primeiro vocabulário do jogador. Todas as definições,
// inclusive as exibidas no guia, continuam vindo do glossário canônico.
export const TUTORIAL_KEYWORDS: TutorialKeyword[] = [
  keyword("Acelerado"),
  keyword("Primeiro Ato"),
  keyword("Último Suspiro"),
  keyword("Enjoo de Invocação"),
  keyword("Investida"),
  keyword("Voar"),
  keyword("Furtivo"),
  keyword("Veloz"),
  keyword("Atropelar"),
  keyword("Roubo de Vida"),
  keyword("Fura-Fila"),
  keyword("Sufocado"),
];

export const GLOSSARY_ENTRIES: TutorialGlossaryEntry[] = Object.entries(GAME_GLOSSARY)
  .map(([key, entry]) => ({ key, ...entry }))
  .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

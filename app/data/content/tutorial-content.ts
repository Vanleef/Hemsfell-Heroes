import { GAME_GLOSSARY, type GameGlossaryTone } from "./game-glossary";

export type TutorialTabId = "start" | "combat" | "reference";

export type TutorialReference = {
  title: string;
  description: string;
  badge?: string;
};

export type TutorialKeyword = TutorialReference & {
  tone: GameGlossaryTone;
};

export const TUTORIAL_TABS: Array<{ id: TutorialTabId; label: string; description: string }> = [
  { id: "start", label: "Como jogar", description: "O essencial em poucos passos" },
  { id: "combat", label: "Combate", description: "Ataque, resposta e defesa" },
  { id: "reference", label: "Referência", description: "Zonas, cartas e palavras-chave" },
];

export const QUICK_FACTS: TutorialReference[] = [
  { title: "Vida", description: "Reduza a Vida do Herói inimigo a 0 para vencer.", badge: "30" },
  { title: "Deck Principal", description: "Seu deck de partida contém 49 cartas válidas.", badge: "49" },
  { title: "Mão inicial", description: "Você começa com 7 cartas antes do mulligan.", badge: "7" },
  { title: "Reserva", description: "Guarda até 3 de Energia para respostas e efeitos permitidos.", badge: "3" },
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
  { title: "⚡", description: "Ativa uma habilidade disponível da carta." },
  { title: "Passar", description: "Devolve a prioridade ou avança quando a interface permitir." },
];

export const BOARD_ZONES: TutorialReference[] = [
  { title: "Herói", description: "Mostra Vida, nível, evolução e habilidades.", badge: "30 ♥" },
  { title: "Criaturas", description: "Cinco espaços usados para atacar e bloquear.", badge: "5" },
  { title: "Auxiliares", description: "Cinco espaços para Artefatos, Encantos e outras constantes.", badge: "5" },
  { title: "Terreno Cruel", description: "Zona reservada ao seu Terreno ativo.", badge: "1" },
  { title: "Deck / Mão", description: "O Deck compra cartas; a Mão guarda suas opções atuais.", badge: "Privado" },
  { title: "Cemitério", description: "Recebe cartas destruídas, descartadas e Feitiços resolvidos.", badge: "Público" },
  { title: "Obscuro", description: "Recebe cartas banidas. É diferente do Cemitério.", badge: "Público" },
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

// O tutorial mostra apenas o vocabulário mais frequente. O glossário completo
// continua sendo a fonte canônica usada pelos tooltips durante a partida.
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

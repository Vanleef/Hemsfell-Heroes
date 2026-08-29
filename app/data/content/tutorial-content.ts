import { GAME_GLOSSARY, type GameGlossaryTone } from "./game-glossary";

export type TutorialTabId = "flow" | "board" | "commands" | "combat" | "mechanics";

export type TutorialReference = {
  title: string;
  description: string;
  badge?: string;
};

export type TutorialKeyword = TutorialReference & {
  tone: GameGlossaryTone;
  example: string;
};

export const TUTORIAL_TABS: Array<{ id: TutorialTabId; label: string; description: string }> = [
  { id: "flow", label: "Fluxo completo", description: "Da preparação à vitória" },
  { id: "board", label: "Tabuleiro", description: "Zonas e recursos" },
  { id: "commands", label: "Comandos", description: "Interação e controles" },
  { id: "combat", label: "Combate", description: "Ataque, defesa e dano" },
  { id: "mechanics", label: "Mecânicas", description: "Cartas e palavras-chave" },
];

export const BOARD_ZONES: TutorialReference[] = [
  { title: "Herói", description: "Mostra Vida, nível, evolução e habilidades. Vida 0 causa derrota.", badge: "30 ♥" },
  { title: "Criaturas", description: "Cinco espaços de combate. Criaturas atacam, bloqueiam e acumulam dano durante o turno.", badge: "5 slots" },
  { title: "Auxiliares", description: "Cinco espaços para constantes. Artefatos normalmente se vinculam à criatura da mesma coluna.", badge: "5 slots" },
  { title: "Terreno Cruel", description: "Uma zona de Terreno por jogador. Jogar outro Terreno substitui o anterior.", badge: "1 zona" },
  { title: "Deck Principal", description: "Fonte normal de compras. Um deck válido contém 49 cartas compatíveis com o Herói.", badge: "49" },
  { title: "Deck Extra", description: "Guarda Imagens que entram no jogo somente quando um efeito as cria ou invoca.", badge: "Imagens" },
  { title: "Cemitério", description: "Recebe cartas destruídas, descartadas e Feitiços resolvidos, salvo regra específica.", badge: "Público" },
  { title: "Obscuro", description: "Zona das cartas banidas. Obscuro e Cemitério são destinos diferentes.", badge: "Banidas" },
];

export const BASIC_COMMANDS: TutorialReference[] = [
  { title: "Hover por 1s", description: "Abre o preview compacto. Sair da carta antes do tempo cancela a abertura." },
  { title: "Pressionar por 1s", description: "Abre a descrição completa. O círculo central acompanha o progresso." },
  { title: "Arrastar", description: "Joga uma carta ou reposiciona quando permitido. Mover cancela a inspeção." },
  { title: "Clique em alvo", description: "Escolhe somente Heróis, cartas ou slots destacados como alvos legais." },
  { title: "Ícone ⚡", description: "Ativa uma habilidade quando custos, timing, condições e limite de uso permitem." },
  { title: "Botão de etapa", description: "Propõe avançar Principal, Combate ou Finalização quando não há decisão pendente." },
  { title: "Responder / Passar", description: "Adiciona uma resposta legal ou devolve a prioridade sem encerrar a etapa por conta própria." },
  { title: "Registro", description: "Consulta ações, compras, dano, efeitos, mudanças de etapa e resultado da partida." },
];

export const COMBAT_STEPS: TutorialReference[] = [
  { title: "Janela inicial", description: "Ao entrar em Combate, respostas Aceleradas podem acontecer antes dos atacantes." },
  { title: "Declare", description: "Escolha criaturas prontas e aptas. Enjoo, Atordoado e restrições impedem ataques ilegais." },
  { title: "Responda", description: "Depois da declaração, o defensor recebe a oportunidade de responder." },
  { title: "Defenda", description: "Associe bloqueadores legais ou aceite dano direto. Voar, Furtivo e Defensor X mudam as opções." },
  { title: "Antes do dano", description: "A última janela pré-dano ocorre após os bloqueios estarem definidos." },
  { title: "Resolva", description: "As linhas resolvem na ordem definida; dano comum é simultâneo, salvo Veloz ou outra regra." },
];

export const CARD_TYPES: TutorialReference[] = [
  { title: "Criatura", description: "Constante com Ofensividade e Vitalidade; ocupa a linha de combate." },
  { title: "Feitiço", description: "Resolve o efeito e normalmente vai ao Cemitério. Acelerado pode responder." },
  { title: "Artefato", description: "Constante auxiliar normalmente vinculada à criatura da mesma coluna." },
  { title: "Encanto", description: "Constante auxiliar com efeito contínuo, gatilhado ou ativável." },
  { title: "Terreno", description: "Constante da zona de Terreno Cruel; apenas um permanece por jogador." },
  { title: "Imagem", description: "Carta do Deck Extra criada por efeito e tratada conforme seu tipo enquanto estiver em jogo." },
];

const keyword = (key: string, example: string): TutorialKeyword => {
  const entry = GAME_GLOSSARY[key];
  if (!entry) throw new Error(`Tutorial keyword missing from GAME_GLOSSARY: ${key}`);
  return { title: entry.label, description: entry.description, tone: entry.tone, example };
};

// Tutorial copy is derived from the same dictionary used by card tooltips.
// This prevents a glossary correction from leaving the onboarding text stale.
export const TUTORIAL_KEYWORDS: TutorialKeyword[] = [
  keyword("Acelerado", "Responda durante uma janela de prioridade."),
  keyword("Primeiro Ato", "Acontece quando a carta entra em campo."),
  keyword("Último Suspiro", "Exige que a carta tenha sido destruída."),
  keyword("Enjoo de Invocação", "Pode defender, mas normalmente não ataca nem paga Virar."),
  keyword("Investida", "Remove a restrição de ataque do turno de entrada."),
  keyword("Voar", "Ao atacar, exige um bloqueador que também tenha Voar."),
  keyword("Furtivo", "O ataque não pode receber bloqueador."),
  keyword("Veloz", "Pode eliminar a defensora antes do contra-ataque."),
  keyword("Atropelar", "Leva o excesso de dano ao Herói defensor."),
  keyword("Robusto", "Reduz cada instância de dano recebida em 1."),
  keyword("Defensor X", "Permite bloquear mais de uma atacante no mesmo Combate."),
  keyword("Roubo de Vida", "Dano efetivo também recupera Vida do controlador."),
  keyword("Toque da Morte", "Dano positivo é letal para criaturas."),
  keyword("Barreira Mágica", "Impede que a carta seja escolhida como alvo de efeitos."),
  keyword("Indestrutível", "Impede destruição, mas não banimento, retorno ou sacrifício."),
  keyword("Fura-Fila", "Liga se outra carta já foi jogada antes no turno."),
  keyword("Alerta", "A atacante não fica virada por causa do ataque."),
  keyword("Indomável", "Precisa atacar antes que o Combate possa terminar."),
  keyword("Sufocado", "Ignora texto, gatilhos, ativáveis e palavras-chave enquanto durar."),
  keyword("Atordoado", "Não pode atacar nem bloquear enquanto durar."),
  keyword("Congelado", "A Ofensividade efetiva é forçada para 0."),
  keyword("Imobilizado", "Impede o próximo desvirar normal indicado pelo efeito."),
];

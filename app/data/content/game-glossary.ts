export type GameGlossaryTone = "keyword" | "positive" | "negative" | "state" | "action" | "resource" | "zone" | "attribute";

export type GameGlossaryEntry = {
  label: string;
  description: string;
  tone: GameGlossaryTone;
  aliases?: string[];
};

export const GAME_GLOSSARY: Record<string, GameGlossaryEntry> = {
  "Constante": { label: "Constante", tone: "state", description: "Qualquer carta ocupando um espaço do campo: Criatura, Artefato, Encanto, Terreno Cruel ou Imagem que seja uma constante.", aliases: ["Constantes"] },
  "Sacrificar": { label: "Sacrificar", tone: "action", description: "Envie a carta ao Cemitério como sacrifício. Sacrificar não conta como destruir e não ativa Último Suspiro.", aliases: ["Sacrifique", "Sacrificada", "Sacrificado"] },
  "Banir": { label: "Banir", tone: "action", description: "Envie a carta para o Obscuro. Ela fica fora do jogo e não pode ser recuperada por efeitos que buscam no Cemitério.", aliases: ["Bana", "Banida", "Banido"] },
  "Destruir": { label: "Destruir", tone: "action", description: "Retire a carta do campo e envie-a ao destino de destruição apropriado. Último Suspiro pode ser ativado quando a carta é destruída.", aliases: ["Destrua", "Destruída", "Destruído"] },
  "Pagar": { label: "Pagar", tone: "resource", description: "Gaste integralmente o recurso indicado antes de o efeito resolver. Se o custo não puder ser pago, a ação não pode ser realizada.", aliases: ["Pague", "Pagamento"] },
  "Ofensividade": { label: "Ofensividade", tone: "attribute", description: "Valor que determina quanto dano a criatura causa em combate e em efeitos que usam sua Ofensividade.", aliases: ["Ataque"] },
  "Vitalidade": { label: "Vitalidade", tone: "attribute", description: "Valor que determina quanto dano a criatura suporta. Dano letal destrói a criatura, salvo se uma regra impedir a destruição.", aliases: ["Vida da criatura", "HP"] },
  "Bloquear": { label: "Bloquear", tone: "action", description: "Designe uma criatura apta para defender contra uma atacante, respeitando restrições como Voar, Furtivo, Atordoado e capacidade de Defensor X.", aliases: ["Bloqueie", "Bloqueador", "Bloqueadora"] },
  "Virar": { label: "Virar", tone: "state", description: "Coloque a carta na posição horizontal. Uma criatura virada não pode atacar nem bloquear e uma carta que exige Virar como custo não pode pagar esse custo novamente enquanto estiver virada.", aliases: ["Vire", "Virada", "Virado"] },
  "Desvirar": { label: "Desvirar", tone: "positive", description: "Retorne a carta à posição vertical e pronta. Na Manutenção, as cartas normalmente desviram, exceto quando uma regra como Imobilizado impedir.", aliases: ["Desvire", "Desvirada", "Desvirado"] },
  "Marcador": { label: "Marcador", tone: "state", description: "Contador numérico colocado em uma carta ou Herói para registrar uma quantidade usada por efeitos. Marcadores podem ser adicionados, removidos, gastos ou multiplicados.", aliases: ["Marcadores"] },
  "+X/+Y": { label: "+X/+Y", tone: "positive", description: "Modificador de atributos: X altera a Ofensividade e Y altera a Vitalidade. Pode ser permanente, temporário, contínuo ou vir de marcadores." },
  "Turno": { label: "Turno", tone: "state", description: "A vez completa de um jogador, da Manutenção até a Finalização. Efeitos 'neste turno' expiram conforme sua duração especificada.", aliases: ["Neste turno", "Até o fim do turno"] },
  "Recuperar": { label: "Recuperar", tone: "positive", description: "Adicione a quantidade indicada do recurso descrito, como Vida ou Energia, respeitando o limite máximo quando houver.", aliases: ["Recupere", "Recupera", "Restaurar", "Restaure", "Cure", "Curar"] },
  "Vincular": { label: "Vincular", tone: "state", description: "Associe uma carta a uma criatura. Em geral, a posição do Artefato indica a criatura vinculada e o vínculo termina quando a regra da fonte mandar.", aliases: ["Vincule", "Vinculado", "Vinculada", "Atrelado", "Atrelada"] },

  "Voar": { label: "Voar", tone: "keyword", description: "Quando ataca, só pode ser bloqueada por criaturas que também tenham Voar. Voar não restringe quais criaturas ela própria pode bloquear." },
  "Barreira Mágica": { label: "Barreira Mágica", tone: "positive", description: "Não pode ser selecionada como alvo de efeitos. Efeitos que não escolhem alvo ainda podem afetá-la." },
  "Atropelar": { label: "Atropelar", tone: "keyword", description: "Depois do dano letal à criatura defensora, o dano excedente da atacante é causado ao Herói defensor." },
  "Triturar": { label: "Triturar", tone: "action", description: "Envie a quantidade indicada de cartas do topo do deck alvo ao Cemitério. Triturar não é destruir e não ativa Último Suspiro.", aliases: ["Tritura", "Triturado", "Triturada"] },
  "Primeiro Ato": { label: "Primeiro Ato", tone: "keyword", description: "Efeito disparado quando a carta entra em campo. Se não houver alvo ou condição válida, a entrada da criatura não é impedida; apenas o efeito é ignorado quando aplicável." },
  "Último Suspiro": { label: "Último Suspiro", tone: "keyword", description: "Efeito disparado quando a carta é destruída. Não ativa se ela for sacrificada, banida ou retornada à mão." },
  "Investida": { label: "Investida", tone: "positive", description: "A criatura pode atacar no mesmo turno em que entra em campo, desde que esteja desvirada e apta a atacar." },
  "Indomável": { label: "Indomável", tone: "keyword", description: "A criatura precisa atacar sempre que estiver apta. Você não pode encerrar o Combate deixando uma Indomável apta sem atacar.", aliases: ["Fúria"] },
  "Furtivo": { label: "Furtivo", tone: "positive", description: "A criatura não pode ser bloqueada. Ela ainda pode bloquear normalmente e continua podendo ser alvo de efeitos." },
  "Veloz": { label: "Veloz", tone: "positive", description: "Em combate contra uma criatura sem Veloz, causa dano primeiro. Se destruir a defensora com esse dano, não sofre o contra-ataque dela." },
  "Robusto": { label: "Robusto", tone: "positive", description: "Reduz em 1 cada instância de dano que a criatura receber, até o mínimo de 0." },
  "Defensor X": { label: "Defensor X", tone: "positive", description: "Pode bloquear até X criaturas atacantes diferentes durante a mesma etapa de Combate.", aliases: ["Defensor"] },
  "Roubo de Vida": { label: "Roubo de Vida", tone: "positive", description: "Sempre que a carta causar dano efetivo, seu controlador recupera a mesma quantidade de Vida. Dano reduzido a 0 não recupera Vida." },
  "Toque da Morte": { label: "Toque da Morte", tone: "positive", description: "Qualquer quantidade positiva de dano que esta carta causar a uma criatura é letal para ela. Indestrutível ainda pode impedir a destruição." },
  "Acelerado": { label: "Acelerado", tone: "keyword", description: "Pode ser jogado em uma janela de resposta. No turno adversário usa apenas Reserva; no seu turno segue as regras de pagamento de resposta do jogo.", aliases: ["Instantâneo", "Instantaneo"] },
  "Congelado": { label: "Congelado", tone: "negative", description: "Enquanto durar, a Ofensividade efetiva da criatura é forçada para 0, inclusive sobre bônus positivos.", aliases: ["Congelada"] },
  "Atordoado": { label: "Atordoado", tone: "negative", description: "Enquanto durar, a criatura não pode atacar nem bloquear. Ela ainda pode sofrer dano e ser alvo de efeitos.", aliases: ["Atordoada"] },
  "Sufocado": { label: "Sufocado", tone: "negative", description: "Enquanto durar, todo o texto de efeito, gatilhos, habilidades ativáveis e palavras-chave da carta são ignorados. Seus atributos impressos permanecem. Quando Sufocado termina, os efeitos e palavras-chave voltam.", aliases: ["Sufocada", "Sufocar"] },
  "Suporte": { label: "Suporte", tone: "positive", description: "Aplica dinamicamente o efeito descrito às criaturas aliadas nas posições adjacentes à fonte enquanto ela estiver válida." },
  "Imobilizado": { label: "Imobilizado", tone: "negative", description: "A criatura não desvira normalmente na próxima Manutenção indicada pelo efeito. Depois dessa manutenção, o estado é consumido.", aliases: ["Imobilizada"] },
  "Indestrutível": { label: "Indestrutível", tone: "positive", description: "Não pode ser destruída por dano letal, combate, Toque da Morte ou efeitos que mandem destruir. Ainda pode ser banida, retornada à mão ou sacrificada quando a regra permitir.", aliases: ["Indestrutivel"] },
  "Investigar X": { label: "Investigar X", tone: "keyword", description: "Olhe as X cartas do topo do deck alvo. Escolha quais permanecem reveladas no topo e Arquive as demais no fundo; quando permitido, reorganize as que permanecem no topo.", aliases: ["Investigar"] },
  "Fura-Fila": { label: "Fura-Fila", tone: "keyword", description: "O efeito adicional é ativado se você já jogou outra carta antes desta no turno atual.", aliases: ["Fura Fila", "Fura-fila"] },
  "Alerta": { label: "Alerta", tone: "positive", description: "A criatura não fica virada depois de atacar. Outros efeitos ainda podem virá-la normalmente." },

  "Enjoo de Invocação": { label: "Enjoo de Invocação", tone: "negative", description: "A criatura acabou de entrar em campo e não pode atacar nem pagar custos de Virar neste turno, salvo se uma regra como Investida permitir atacar.", aliases: ["Enjoo"] },
  "Revelada": { label: "Revelada", tone: "state", description: "A identidade desta carta está visível para ambos os jogadores enquanto o efeito de revelação durar.", aliases: ["Revelado", "Revelar"] },
  "Arquivar": { label: "Arquivar", tone: "action", description: "Coloque a carta observada no fundo do deck indicado pelo efeito.", aliases: ["Arquivada", "Arquivado"] },
  "Obscuro": { label: "Obscuro", tone: "zone", description: "Zona para cartas banidas e tratadas como fora do jogo. Não é o Cemitério." },
  "Cemitério": { label: "Cemitério", tone: "zone", description: "Zona que recebe cartas destruídas, descartadas e outras cartas enviadas para lá por efeito. Cartas banidas vão para o Obscuro, não para o Cemitério.", aliases: ["Cemiterio"] },
  "Reserva": { label: "Reserva", tone: "resource", description: "Armazena até 3 de Energia restante. É usada por Feitiços e por efeitos que permitem pagamento com Reserva; respostas no turno adversário dependem dela.", aliases: ["Reserva de Energia"] },
  "Imagem": { label: "Imagem", tone: "state", description: "Carta do Deck Extra criada ou invocada por efeitos. Enquanto está em campo, é tratada conforme seu tipo de constante; cópias temporárias podem se dissipar ao sair.", aliases: ["Imagens"] },
  "Deck Extra": { label: "Deck Extra", tone: "zone", description: "Zona que contém Imagens e outras cartas que não fazem parte do Deck Principal e entram no jogo por efeitos específicos." },
  "Efeito Ativável": { label: "Efeito Ativável", tone: "state", description: "Habilidade que o controlador escolhe ativar quando cumpre timing, alvo e custos. Custos são pagos antes da resolução.", aliases: ["Ativável", "Ativavel"] },
  "Passiva": { label: "Passiva", tone: "state", description: "Habilidade que funciona automaticamente quando sua condição ou gatilho é satisfeito; não exige clique para ativação." },
  "Escudo de Dano": { label: "Escudo de Dano", tone: "positive", description: "Proteção temporária que reduz ou impede uma instância de dano conforme o efeito que criou o escudo.", aliases: ["Escudo"] },
  "Custo Reduzido": { label: "Custo Reduzido", tone: "positive", description: "O custo atual desta carta está abaixo do custo impresso por causa de um efeito temporário ou contínuo." },
  "Custo Aumentado": { label: "Custo Aumentado", tone: "negative", description: "O custo atual desta carta está acima do custo impresso por causa de um efeito temporário ou contínuo." },
  "Ofensividade Aumentada": { label: "Ofensividade Aumentada", tone: "positive", description: "A Ofensividade atual está acima do valor impresso por causa de bônus, marcadores ou efeitos contínuos." },
  "Ofensividade Reduzida": { label: "Ofensividade Reduzida", tone: "negative", description: "A Ofensividade atual está abaixo do valor impresso por causa de penalidades, estados ou efeitos contínuos." },
  "Vitalidade Aumentada": { label: "Vitalidade Aumentada", tone: "positive", description: "A Vitalidade máxima atual está acima do valor impresso por causa de bônus, marcadores ou efeitos contínuos." },
  "Vitalidade Reduzida": { label: "Vitalidade Reduzida", tone: "negative", description: "A Vitalidade máxima atual está abaixo do valor impresso por causa de penalidades ou efeitos contínuos." },
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[‐‑‒–—]/g, "-")
  .replace(/[^a-zA-Z0-9+/-]+/g, " ")
  .trim()
  .toLowerCase();

const aliasEntries = Object.values(GAME_GLOSSARY).flatMap((entry) => [entry.label, ...(entry.aliases || [])].map((alias) => [normalize(alias), entry] as const));
const aliasMap = new Map(aliasEntries);

export function gameGlossaryEntry(value: string): { key: string; description: string; tone: GameGlossaryTone } | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\+\d+\s*\/\s*\+\d+$/i.test(raw)) {
    const entry = GAME_GLOSSARY["+X/+Y"];
    return { key: "+X/+Y", description: entry.description, tone: entry.tone };
  }
  const normalized = normalize(raw);
  if (/^defensor\s+\d+$/.test(normalized)) {
    const entry = GAME_GLOSSARY["Defensor X"];
    return { key: "Defensor X", description: entry.description, tone: entry.tone };
  }
  if (/^investigar\s+\d+$/.test(normalized)) {
    const entry = GAME_GLOSSARY["Investigar X"];
    return { key: "Investigar X", description: entry.description, tone: entry.tone };
  }
  const entry = aliasMap.get(normalized);
  if (!entry) return null;
  return { key: entry.label, description: entry.description, tone: entry.tone };
}

const patternTerms = [...new Set(Object.values(GAME_GLOSSARY).flatMap((entry) => [entry.label, ...(entry.aliases || [])]))]
  .filter((term) => !["+X/+Y", "Defensor X", "Investigar X"].includes(term))
  .sort((a, b) => b.length - a.length)
  .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+"));

export const gameGlossaryPattern = new RegExp(
  `(Barreira\\s+Mágica|Toque\\s+da\\s+Morte|Roubo\\s+de\\s+Vida|Último\\s+Suspiro|Primeiro\\s+Ato|Fura[-\\s]?Fila|Defensor\\s+\\d+|Investigar\\s+\\d+|\\+\\d+\\s*\\/\\s*\\+\\d+|${patternTerms.join("|")})`,
  "gi",
);

export function glossaryDescription(label: string) {
  return gameGlossaryEntry(label)?.description || "Termo de regra de Hemsfell Heroes.";
}

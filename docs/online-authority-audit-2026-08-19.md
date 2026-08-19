# Auditoria de multiplayer autoritativo — 2026-08-19

Escopo: modo ONLINE de Hemsfell Heroes. Esta auditoria não altera balanceamento, texto/regras de cartas nem redesign visual. O foco é autoridade do servidor, sincronização, prioridade, combate, privacidade, retries, reconexão e setup.

## Fluxo autoritativo rastreado

### `playCard`

1. O cliente cria um `commandId` e envia `action: "command"`, `baseRevision` e a intenção `playCard`.
2. A rota autentica o token e deriva `role` (`host`/`guest`).
3. `applyRulesCommand` ignora qualquer `owner` recebido do navegador e o substitui pelo índice derivado do token.
4. `baseRevision` precisa coincidir com `room.revision`. Um `commandId` já aplicado é reconhecido antes da checagem de revision para que retry do mesmo comando seja idempotente.
5. `executeOnlineCommand` encaminha ao rules-engine compartilhado. O preflight de `playCard` valida carta na mão, fase, prioridade, custo e alvos antes de abrir a janela.
6. O servidor reconcilia deadlines, incrementa `revision` e persiste com CAS.
7. A resposta passa por `roomView`, que redige informação privada antes de chegar ao cliente.

### `passPriority`

1. Apenas `pendingResponse.responder` pode passar.
2. Primeiro passe entrega prioridade ao `actor` e registra `passes: 1`.
3. Segundo passe resolve o topo da pilha/checkpoint pelo motor.
4. Se a resolução produzir uma decisão interativa, a janela de prioridade é suspensa enquanto o jogador escolhe alvo/efeito; ela é restaurada depois da escolha.
5. O servidor é o único responsável por trocar `pendingResponse`, avançar o combate e atualizar deadlines.

## Problemas confirmados e correções

| Severidade | Problema confirmado | Sintoma / impacto | Correção |
| --- | --- | --- | --- |
| BLOQUEANTE | Inicialização da partida vinha do browser do host | Host podia construir o snapshot inicial completo, inclusive ordem/hand do guest, e enviar um estado estruturalmente válido arbitrário | Criação, IDs e shuffle dos dois decks migrados para `app/api/rooms/initial-game.ts`; `initialize` e `sync` de snapshot foram desabilitados |
| ALTO | CAS da tabela podia ser contornado por fallback | Duas requisições concorrentes poderiam divergir e uma escrita stale tentar sobreviver em Storage/Blob | Conflito de revision não cai cegamente para outro backend; leitura escolhe a cópia de maior revision e escrita valida revision no fallback |
| ALTO | Retry não era estritamente idempotente | Retry/double-click podia reenviar a mesma intenção com revision nova | `commandId` obrigatório; duplicata é reconhecida antes da checagem de revision; janela aumentada para 128 IDs recentes |
| ALTO | Payload de decisão podia vazar dados privados | Alguns `pendingDecision.effect/context/targetSteps` podem carregar cartas/candidatos de zonas privadas | Para o não proprietário, decisão é reduzida a um envelope `opponent-choice` sem `effect`, `context` ou `targetSteps` |
| ALTO | Redação de cartas reveladas ignorava escopo de `revealedTo` | Carta revelada só a um jogador podia ser serializada para o outro | Visibilidade agora exige `revealed === true` e, quando presente, `revealedTo` contendo o viewer |
| ALTO | Escolha de alvo podia coexistir com janela de prioridade | UI mostrava decisão + “Sua prioridade”/“aguardando resposta”; risco de deadlock e comandos na janela errada | Prioridade é suspensa durante `pendingDecision`/`pendingReposition` e retomada só após resolver a decisão |
| ALTO | Turn timer continuava conceitualmente concorrendo com decisões | Jogador podia terminar uma escolha e receber timeout imediato da fase | Action clock agora pausa em resposta, blocker choice, target/effect decision e reposition, preservando o tempo restante |
| ALTO | Blocker command precisava de guarda explícita na fronteira HTTP | Cliente adulterado podia tentar `selectDefender` fora da janela/como atacante | `machine.ts` rejeita fora de `stage === choosing` e exige `owner === 1 - attackerOwner`; o engine continua validando novamente |
| MÉDIO | Poll GET e POST podiam detectar o mesmo timeout | Uma das gravações podia perder o CAS e virar erro de sala | Timeout usa CAS; o perdedor recarrega a revisão vencedora |
| MÉDIO | `timeout` no-op tentava persistir revision inalterada | Podia produzir conflito falso sem nenhuma transição | Sem mudança de timeout, a rota retorna o snapshot atual sem escrever |
| MÉDIO | Reconexão de dois jogadores podia deslocar clocks duas vezes | Deadlines podiam ganhar tempo extra incorreto | `pauseStartedAt` é compartilhado; deadlines são deslocados uma única vez quando a sala volta a ficar totalmente conectada |
| MÉDIO | Sala legada podia recuperar `pendingResponse`/blocker sem deadline | Janela podia ficar eterna após refresh | Servidor semeia um deadline de resposta para snapshots legados sem deadline |
| MÉDIO | Erro CAS retornava pouca informação ao cliente | Cliente podia continuar com snapshot antigo depois de 409 | Resposta stale inclui o `roomView` autoritativo mais recente para reconciliação |
| MÉDIO | Shuffle online usava aleatoriedade não criptográfica | Ordem do deck era gerada com PRNG inadequado para integridade competitiva | Bootstrap autoritativo usa `crypto.getRandomValues` com rejection sampling |

## Riscos remanescentes

### 1. Fallback de object storage não oferece CAS transacional real

Supabase Storage e Vercel Blob fazem `read -> compare revision -> write`. Isso detecta muitos estados stale, mas não torna duas funções serverless concorrentes atomicamente serializadas. Se a tabela PostgREST estiver indisponível e duas intenções diferentes forem processadas ao mesmo tempo usando somente object storage, ambas ainda podem observar a mesma revision antes da gravação.

**Próxima evolução recomendada:** manter a tabela transacional como autoridade única de escrita. Storage/Blob deve ser backup/recuperação, não autoridade concorrente para uma sala ativa.

### 2. Cliente ainda contém caminhos legados de mutação local

`page.tsx` ainda possui `update(...)`/`syncOnlineGame(...)` usados por código legado. O servidor agora rejeita snapshots completos e devolve o estado autoritativo, portanto esses caminhos não conseguem mais corromper a sala, mas podem causar estado visual transitório/flicker antes da reconciliação.

**Próxima evolução recomendada:** gradualmente impedir `update()` de mutar `Game` quando `mode === "online"` e migrar os últimos caminhos legados para comandos explícitos. Fazer isso por mecânica, com regressão, sem reescrever o motor.

### 3. Setup simultâneo pode exigir retry de UX

`select` e `mulligan` são protegidos por CAS, portanto não perdem estado silenciosamente. Porém duas confirmações simultâneas em clientes diferentes podem fazer uma delas receber `409 stale revision` e precisar ser reenviada. Não há corrupção, mas há atrito.

### 4. Decisões obrigatórias não possuem política genérica de autoescolha

O relógio de ação fica pausado corretamente durante uma decisão. Se um jogador permanece conectado e simplesmente nunca escolhe, algumas decisões podem ficar abertas indefinidamente. Não foi inventada uma escolha padrão, porque isso alteraria regras/semântica das cartas.

## Cobertura adicionada

- jogador errado tentando `passPriority`;
- dois passes consecutivos resolvendo uma resposta Acelerado no topo da pilha;
- blocker somente pelo defensor;
- serialização/refresh preservando `combatAction` pendente;
- presença das guardas de idempotência, revision e owner;
- servidor como dono da construção/shuffle inicial;
- `initialize`/`sync` de snapshots desabilitados;
- redação de mão/deck/Deck Extra do oponente e de `pendingDecision` privado;
- timeout no-op sem escrita;
- relógio pausado e restaurado durante `pendingDecision` e `pendingReposition`;
- regressão anterior de prioridade suspensa durante escolha de alvo de habilidade.

## Reprodução rápida — antes/depois

### Double submit

Antes: dispare a mesma intenção em duas requisições/retry. Havia risco de segunda aplicação conforme a revision mudasse.

Depois: ambas usam o mesmo `commandId`; se a primeira foi commitada, a segunda retorna o snapshot atual sem reaplicar.

### Jogador errado em prioridade

Antes/risco: adulterar `owner` no payload ou disparar passe pela aba sem prioridade.

Depois: `owner` é sobrescrito pelo role autenticado; o engine exige `pendingResponse.responder === owner`.

### Ataque / blocker

Antes/risco: enviar `selectDefender` manualmente pelo atacante ou fora de `choosing`.

Depois: a fronteira da sala e o engine rejeitam; somente `1 - attackerOwner` escolhe bloqueador.

### Refresh durante resposta/bloqueio

Antes/risco: snapshots antigos sem deadline podiam voltar para uma janela sem expiração.

Depois: `pendingResponse` e `combatAction` são persistidos; snapshots legados sem deadline recebem um deadline no servidor.

### Privacidade

Antes: `pendingDecision` podia transportar dados internos para o não proprietário; inicialização pelo host conhecia o snapshot inicial do guest.

Depois: partida é construída no servidor e decisões do oponente são whitelisted para um envelope mínimo.

### Stale revision

Antes/risco: fallback podia transformar conflito em outra escrita.

Depois: CAS stale não é contornado quando o backend observado está na revision esperada ou superior; a API responde 409 com o snapshot mais novo.

## Checklist manual ONLINE — duas abas

1. Criar sala na aba A e aceitar na aba B; selecionar decks quase simultaneamente.
2. Confirmar que somente o vencedor da moeda escolhe quem começa.
3. No mulligan, confirmar simultaneamente nas duas abas; verificar que a partida só inicia após ambos estarem concluídos.
4. Abrir DevTools/Network em ambas: a aba A nunca deve receber nomes/imagens/IDs reais da mão, deck fechado ou Deck Extra da aba B, e vice-versa.
5. Jogar uma carta normal. Confirmar mesma `revision`, `phase`, `active` e `pendingResponse` nas duas abas.
6. Durante uma janela, clicar “passar” duas vezes rapidamente. O comando deve aplicar no máximo uma vez; não deve haver vida/energia/carta duplicada.
7. Responder com Acelerado e passar prioridade nos dois lados até a pilha resolver; nenhuma aba deve ficar esperando para sempre.
8. Ativar habilidade que pede alvo. Durante a escolha, não deve existir janela de resposta concorrente; após escolher, a prioridade deve retomar.
9. Declarar ataque. Na janela de bloqueio, apenas a aba defensora deve poder escolher bloqueador ou dano no herói.
10. Dar refresh no defensor enquanto `combatAction.stage === choosing`; a escolha deve continuar disponível e o atacante deve continuar aguardando.
11. Tentar avançar o combate com uma criatura Indomável ainda obrigada a atacar; o servidor deve recusar/forçar o fluxo legal.
12. Abrir a mesma sala em uma aba duplicada e gerar duas intenções concorrentes; uma revision vence e a outra recebe/reconcilia o estado novo.
13. Desconectar uma aba por menos de 60 s e voltar; fase/active/pending state devem continuar, e os timers não devem perder nem ganhar tempo indevidamente.
14. Desconectar ambos e reconectar em ordem inversa; verificar que o tempo é deslocado apenas uma vez.
15. Deixar expirar uma janela de resposta e uma escolha de bloqueador; o servidor deve executar autopass/no-block para o jogador correto.
16. Comparar host e guest após cada cenário: `phase`, `active`, `round`, vidas, energia/reserva e janela de ação devem representar a mesma partida canônica.

# Hemsfell Heroes — Online Turn Flow v3

Este documento define o contrato do modo Online. Ele complementa o **Manoel de Regras** sem alterar as regras de carta: o objetivo é tornar prioridade, combate, timers e reconexão determinísticos sob um servidor autoritativo.

## Princípios

1. **Servidor autoritativo.** O cliente envia somente intenções. `machine.ts` autentica o jogador, valida `baseRevision`/`commandId` e encaminha o comando ao kernel Online. O navegador nunca envia um estado de partida completo nem resolve dano de combate.
2. **Uma única fonte de verdade para regras.** O kernel Online organiza timing e prioridade; a legalidade de cartas, alvos, ataques, bloqueios, custos, palavras-chave e transições continua no rules engine.
3. **Uma janela, um dono.** Se `pendingResponse` existe, existe exatamente um `responder`; `priority.owner` deve ser o mesmo jogador. Durante escolha de bloqueio, `priority.mode=blocker` e o dono é exclusivamente o defensor.
4. **Sem duas interações concorrentes.** Escolhas de alvo/efeito/reposicionamento suspendem a janela de resposta e a restauram somente depois da decisão.
5. **Relógio do servidor.** O relógio de ação pausa quando resposta, bloqueio ou decisão possuem o input. O tempo dessas interações possui deadline próprio.
6. **Idempotência.** Repetir um `commandId` já confirmado não aplica a ação duas vezes. Revisão obsoleta falha fechada.

## Fluxo canônico

```text
MANUTENÇÃO
  decisão de manutenção -> energia -> triggers/interações
       |
       v
PRINCIPAL / ACTION
  ação do ativo
       -> RESPONSE (oponente primeiro)
       -> passes consecutivos resolvem
       -> ACTION do ativo

  pedido de FIM DA PRINCIPAL
       -> RESPONSE do oponente
       -> se ninguém responder: entra COMBATE
       -> se houver resposta: resolve a cadeia, volta à PRINCIPAL

COMBATE / COMBAT_IDLE
  ativo declara 1 atacante
       -> BLOCKER (somente defensor: bloqueador legal ou Não bloquear)
       -> RESPONSE pós-bloqueio (atacante primeiro)
       -> dois passes consecutivos
       -> servidor resolve exatamente esse ataque
       -> COMBAT_IDLE

  endCombat somente se legal
       -> FINALIZAÇÃO

FINALIZAÇÃO
  energia principal -> reserva (máx. 3)
       -> triggers EOT
       -> RESPONSE (ativo primeiro)
       -> limpeza
       -> troca jogador ativo
       -> MANUTENÇÃO
```

## Matriz comando → estado válido

| Comando | Estado/janela | Quem pode enviar | Resultado autoritativo |
|---|---|---|---|
| `maintenanceChoice` | decisão de Manutenção | jogador ativo/dono da decisão | aplica escolha, gera energia e continua triggers |
| `playCard` | Action Priority | ativo | anuncia ação e, quando aplicável, abre resposta ao oponente |
| `playCard` Acelerado | Response Priority | `responder` | adiciona resposta à pilha |
| `activate` / `activateHero` | Action ou Response quando legal | dono da prioridade | resolve custos/alvos pelo rules engine |
| `advancePhase` | Principal, ociosa | ativo | abre `main-end` para o oponente |
| `passPriority` | Response Priority | `responder` | 1º pass entrega prioridade; 2º pass consecutivo resolve o topo/root |
| `declareAttack` | Combate ocioso | ativo | congela 1 atacante e transfere input ao defensor |
| `selectDefender` | bloqueio pendente não comprometido | defensor | compromete bloqueio/Não bloquear e abre resposta pós-bloqueio |
| `attack` | **nunca público** | somente kernel do servidor | resolve dano do ataque comprometido |
| `advancePhase` | Combate ocioso | ativo | entra em Finalização somente se `canEndCombat` for verdadeiro |
| `resolveDecision` | decisão pendente | dono da decisão | conclui alvo/escolha e retoma a prioridade suspensa |
| `reposition` / `confirmReposition` | reposicionamento pendente | dono da decisão | conclui reposicionamento e retoma fluxo |

## Fim da Principal

`advancePhase` durante a Principal não muda a fase imediatamente. Ele cria uma raiz `main-end` e entrega prioridade ao oponente.

- Se o oponente passa e o ativo também passa, a transição é resolvida e entra em Combate.
- Se qualquer resposta é adicionada pelo oponente, o pedido de fim da Principal é consumido. A cadeia resolve normalmente e o ativo recebe Action Priority novamente na Principal. Para avançar, precisa pedir o fim da fase de novo.

Isso impede o Combate de começar por baixo de uma resposta ainda em resolução.

## Combate unitário

### 1. COMBAT_IDLE

Somente o ativo pode declarar um ataque. `listAttackCapableCreatures` consulta o mesmo rules engine usado na resolução, portanto enjoo de invocação, Investida, Atordoado, virada, limites de ataque, requisitos de carta e demais regras não são duplicados no cliente.

### 2. BLOCKER

Depois de `declareAttack`, não existe uma janela vazia antes do bloqueio. O defensor recebe input exclusivo para:

- escolher um bloqueador aceito por `listLegalBlockers`; ou
- escolher **Não bloquear**.

A escolha é marcada por `blockCommitted=true` antes da janela de resposta pós-bloqueio. Isso impede dupla escolha após refresh/retry.

### 3. RESPONSE pós-bloqueio

Após o bloqueio estar comprometido, o atacante recebe a primeira prioridade de resposta. Um pass entrega prioridade ao defensor; dois passes consecutivos resolvem o ataque.

O navegador **não** envia `attack`. A raiz de resolução é criada internamente pelo servidor com `__onlineCombatResolution=true` e o rules engine aplica o dano.

Se uma resposta remove o atacante antes da resolução, o ataque é cancelado sem travar a sala. Se uma resposta torna o bloqueador previamente escolhido ilegal, o bloqueio deixa de existir e o mesmo ataque segue sem bloqueio.

### 4. INDOMÁVEL

Enquanto existir uma criatura do ativo com **Indomável** que esteja apta a atacar e ainda possua ataque disponível, `advancePhase` no Combate é rejeitado pelo rules engine.

O Online não mantém uma regra paralela: `canEndCombat` e `listPendingIndomitableAttackers` consultam o motor autoritativo. A UI pode usar esses helpers para explicar por que o fim do Combate está desabilitado.

## Timers

- **Action clock:** pertence ao jogador ativo e não é recarregado por ações normais.
- **Response clock:** deadline próprio para o `responder`; expiração envia `passPriority` pelo servidor.
- **Blocker clock:** deadline próprio do defensor; expiração equivale a **Não bloquear**.
- **Decision clock:** enquanto uma escolha de alvo/efeito/reposicionamento está aberta, o action clock permanece pausado.
- **COMBAT_IDLE expirado:** se existir Indomável obrigatória, o servidor declara primeiro um ataque obrigatório. Só tenta avançar fase quando a transição é legal.
- **Reconexão:** deadlines absolutos são deslocados juntos durante a pausa compartilhada; após o limite de reconexão, o jogador desconectado perde a partida.

## Finalização

A saída legal do Combate entra diretamente na rotina de Finalização:

1. energia principal restante é movida para Reserva até o máximo 3;
2. efeitos/triggers de fim de turno são processados;
3. abre-se a janela EOT, normalmente com o ativo primeiro;
4. após passes e decisões, ocorre limpeza;
5. muda o jogador ativo e inicia a Manutenção seguinte.

Não existe uma janela vazia extra de `combat-end`: a interação relevante é a janela EOT da própria Finalização.

## Compatibilidade e recuperação

- snapshots antigos `online-v2` continuam legíveis;
- checkpoints legados de combate agrupado podem ser descartados de forma segura durante recuperação;
- `declareAttackers` e `declareBlockers` são rejeitados pelo kernel novo;
- `onlineCombat` legado não autoriza jogadas novas e é removido quando o estado volta a ficar ocioso;
- `blockCommitted` diferencia a antiga apresentação `stage="choosing"` da decisão de bloqueio realmente aberta, evitando que UI e relógio tratem uma escolha já comprometida como editável.

## Invariantes que testes devem proteger

- `pendingResponse !== null` ⇒ um único `responder` válido e `priority.owner === responder`;
- bloqueio não comprometido ⇒ somente defensor possui input;
- comando público `attack` ⇒ rejeitado;
- duas passagens consecutivas ⇒ resolvem exatamente o topo/root atual;
- resposta ao pedido de fim da Principal ⇒ volta à Principal;
- ataque unitário resolve antes de outro atacante poder ser declarado;
- timeout de bloqueio ⇒ Não bloquear, nunca `endCombat`;
- Indomável apta ⇒ `endCombat` ilegal e timeout prioriza o ataque obrigatório;
- reserva final ≤ 3;
- refresh/retry não duplica comando nem reabre bloqueio já comprometido;
- ambos os clientes veem o mesmo estado canônico apenas orientado para sua perspectiva.

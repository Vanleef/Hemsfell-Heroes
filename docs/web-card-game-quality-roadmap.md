# Hemsfell Heroes — diagnóstico e roadmap de qualidade web

## Diagnóstico rápido

### UI e frontend

- O board possui uma boa fundação responsiva baseada em container queries, `clamp`, `cqw` e `cqh`, mas a cascata ainda é fragmentada entre arquivos históricos e overrides. Novas geometrias devem continuar entrando pelo stylesheet canônico, enquanto regras antigas são gradualmente removidas.
- A arte das cartas já tem lazy loading com `IntersectionObserver`, cache da promessa do PDF e cache de páginas. Portanto, "lazy loading" não é uma lacuna; as próximas otimizações são limitar renderizações simultâneas, medir memória dos canvases e virtualizar listas realmente grandes.
- O inspector expandido já existe e é apropriado para clique/toque. O tooltip anterior clonava DOM manualmente somente em algumas listas e ainda dependia de seletores/contextos específicos.
- A Collection atual apresenta decks predefinidos. Ela ainda não é um deck builder mutável/persistente, apesar de possuir listas Main/Extra e contadores de cópias.
- Para React, pooling manual de componentes de carta não é recomendado: quebra identidade, foco, drag & drop e reconciliação. Preferir virtualização/windowing, `content-visibility` e cache de arte; pooling pode ser usado internamente apenas para recursos de canvas/bitmap.

### Multiplayer

O modo Online atual já possui uma base autoritativa relevante:

- O cliente envia comandos unitários; upload de snapshots completos está desativado.
- O servidor autentica o papel pelo token e substitui qualquer `owner` enviado pelo navegador.
- O motor valida custo, turno, prioridade, alvo, zona, combate e decisões.
- `commandId` fornece idempotência; `baseRevision` e persistência CAS evitam lost updates.
- Views públicas redigem mão, deck, extra deck e decisões privadas do oponente.
- O estado é serializável e a reconexão restaura o snapshot autoritativo.
- Há deadlines autoritativos para turno, prioridade, bloqueio, decisões e reposicionamento.
- Diagnósticos são limitados e não registram tokens nem zonas privadas.

Lacunas principais:

1. Transporte ainda baseado em polling HTTP de snapshots; não há push de eventos.
2. Não existe matchmaking/fila/ranked/casual/aceite de partida.
3. Não há RTT/ping, telemetria agregada, replay persistente nem painel operacional.
4. O storage possui caminhos de fallback; produção deve eleger uma única fonte autoritativa transacional por sala.
5. Não há prediction visual formal. Em card games, não se deve prever regra/estado oculto: apenas antecipar gesto/animação e reconciliar com confirmação.
6. Validação estrutural dos payloads é global e o motor valida semântica; schemas explícitos por tipo de comando melhorariam mensagens, observabilidade e superfície anti-cheat.

## Plano priorizado

### P0 — concluído nesta etapa

1. Tooltip/preview único com Floating UI:
   - portal fora de todos os stacking contexts;
   - `offset`, `flip`, `shift`, `size` e `autoUpdate`;
   - hover/foco em mouse e teclado;
   - long-press no touch com preview ampliado;
   - tooltip também disponível para cartas no board;
   - inspector existente preservado.
2. Collection:
   - busca textual diferida;
   - filtro de tipo;
   - contagem de resultados;
   - validação visível de 49 cartas, cópias e separação Main/Extra.

### P1 — próxima entrega

1. Criar modelo persistente `UserDeck` separado de `DeckDef`:
   - `heroId`, `main[{cardId, quantity}]`, `extra[cardId]`, nome e versão;
   - validador compartilhado executado no cliente para feedback e no servidor como autoridade;
   - limites de cópias, tamanho, identidade do herói e Imagens no Extra.
2. Implementar drag & drop acessível Collection ↔ Main ↔ Extra:
   - Pointer Events + alternativa de teclado/botões;
   - preview de drop válido/inválido;
   - atualização imutável e undo local;
   - persistência somente após validação.
3. Separar `OriginalCard`, Collection e board do monólito `page.tsx` em componentes memoizáveis.
4. Adicionar schemas explícitos por comando no boundary HTTP e códigos de erro traduzíveis.

### P2 — online competitivo

1. Trocar polling por canal push:
   - primeira opção para a arquitetura atual: Postgres/Supabase como row CAS + Supabase Realtime para avisar nova `revision`;
   - o aviso contém somente room id/revision; o cliente busca snapshot redigido quando necessário;
   - manter polling lento como fallback de recuperação.
2. Event envelope ordenado pelo servidor:

```ts
type MatchEvent = {
  matchId: string;
  revision: number;
  commandId: string;
  serverAt: number;
  actor: "host" | "guest";
  kind: string;
  presentation?: { kind: string; sourceId?: string; targetIds?: string[] };
};
```

3. Prediction limitada:
   - cliente mostra carta/ataque em estado "pendente";
   - não altera energia, vida, zonas nem prioridade antes do ACK;
   - ACK confirma animação e snapshot; rejeição retorna visualmente a carta;
   - `revision` ordena tudo, nunca timestamp do cliente.
4. Salvar replay como sequência de comandos aceitos + versão do ruleset + seed inicial; snapshots periódicos aceleram recuperação.
5. Matchmaking com estado explícito: `queued → found → accepting → room → mulligan → started → finished`.

### P3 — operação e escala

- Métricas: latência p50/p95, conflitos CAS, rejeições por código, reconexões, duração, turnos expirados e rooms órfãs.
- Tracing por `matchId`, `commandId`, `revision`; nunca registrar conteúdo privado.
- Rate limit por token/sala/IP para join, polling e commands.
- Job de expiração de rooms e retenção distinta para snapshot, replay e diagnóstico.
- Testes de carga com mixes de polling, prioridade, reconexão e comandos simultâneos.

## Responsabilidades

| Cliente | Servidor |
|---|---|
| Capturar gesto, mostrar intenção pendente e reproduzir animações | Autenticar jogador e escolher `owner` |
| Renderizar somente a view redigida recebida | Validar custo, alvo, zona, timing e prioridade |
| Reenviar o mesmo `commandId` após falha transitória | Deduplicar comando e ordenar por `revision` |
| Reconciliar ou cancelar apresentação pendente | Persistir atomicamente e publicar nova revisão |
| Medir RTT sem decidir deadlines | Controlar clocks, timeout, abandono e resultado |

## Arquivos desta etapa

- `app/presentation/cards/card-preview-runtime.tsx`: Floating UI, portal, hover/foco e long-press.
- `app/presentation/match/match-ui-runtime.tsx`: monta o runtime global de preview.
- `app/page.tsx`: expõe metadados/tooltip de todas as cartas e adiciona filtros/validação da Collection.
- `app/presentation/styles/match-ui.css`: aparência e limites responsivos do preview.
- `app/presentation/styles/base/ui-overrides.css`: toolbar, filtros, validação e estado vazio da Collection.
- `package.json` / `package-lock.json`: dependência `@floating-ui/react`.

## Checklist de aceite

### Tooltip e preview

- [ ] Hover de qualquer carta abre tooltip sem alterar o layout.
- [ ] Tooltip vira para o lado disponível e não sai da viewport.
- [ ] Scroll/resize reposiciona o tooltip automaticamente.
- [ ] Tooltip aparece acima de modais, listas, energia, board e resposta.
- [ ] Teclado abre por foco e fecha com Escape.
- [ ] Long-press touch abre carta grande + efeito completo.
- [ ] Movimento de scroll cancela long-press.
- [ ] Um long-press não dispara também a ação normal da carta.

### Collection

- [ ] Busca encontra nome, texto, tipo, subtipo e palavra-chave.
- [ ] Filtro funciona em Main e Extra sem reflow excessivo.
- [ ] Contadores de cópias permanecem visíveis.
- [ ] Lista inválida bloqueia "Usar este deck" e explica o motivo.
- [ ] Lista vazia pelos filtros tem feedback explícito.
- [ ] Próxima fase: DnD possui alternativa de teclado e validação server-side.

### Online

- [ ] Todo comando aceito possui `commandId` e revisão monotônica.
- [ ] Retry não aplica efeito duas vezes.
- [ ] Cliente nunca recebe zonas privadas do oponente.
- [ ] Comando inválido não altera revisão nem estado.
- [ ] Reconexão restaura snapshot, clocks e interação pendente.
- [ ] Timeout é decidido pelo servidor.
- [ ] Próxima fase: push e polling fallback convergem para a mesma revisão.
- [ ] Próxima fase: replay reproduz deterministicamente o resultado.

## Riscos e trade-offs

- Floating UI aumenta pouco o bundle, mas elimina uma grande classe de bugs de clipping. O runtime é carregado globalmente porque cartas existem em várias telas.
- Renderizar canvas PDF para cada carta ainda é caro em dispositivos fracos. Lazy loading já reduz o custo; virtualização deve ser medida antes de adicionada porque listas atuais são pequenas.
- Prediction completo melhora sensação de latência, mas introduz rollback complexo e vazamento potencial de informação. Para este jogo, prediction apenas de apresentação é o equilíbrio correto.
- WebSocket em funções serverless exige infraestrutura compatível. Realtime como invalidation + fetch autoritativo reduz acoplamento e preserva o modelo CAS atual.
- Fallbacks simultâneos de storage aumentam disponibilidade, mas também risco de cópias divergentes. Uma fonte primária única com backup assíncrono é mais previsível para partidas competitivas.

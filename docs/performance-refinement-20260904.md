# Refinamento de UI, artes e testes — 04/09/2026

Base: `main`, commit `6573a18`, maior data de commit entre as 23 branches remotas consultadas. Branch de trabalho: `perf/ui-assets-test-refinement-20260904`.

## Diagnóstico e prioridades

| Prioridade | Evidência no código atual | Refinamento aplicado |
| --- | --- | --- |
| Crítico | `MatchLoadingRuntime` encerrava `visibleRef` no cleanup, mas não a reativava no replay de efeitos do Strict Mode. As verificações posteriores retornavam sem liberar o carregamento. | Reativação no setup; testes de readiness, replay e descarte de timers/observadores/interceptação de teclado. |
| Alto | `createRaster` restaurava CacheStorage/decodificava bitmap e iniciava `loadCatalogPage` antes da fila. A concorrência configurada limitava apenas a rasterização PDF. | Toda a cadeia entra na mesma fila priorizada; removido o acesso antecipado não aguardado ao PDF. Limites fora da partida: 1 operação em dispositivo restrito, 2 em desktop; em partida: 2/3. |
| Alto | Proteção por página retinha também rasters de 240/360 px; o helper de retenção compacta existia, mas não era usado pelo descarte. | Apenas o raster compacto é fixado pelo preload da partida. Páginas explicitamente em foco continuam protegidas. O orçamento é reaplicado após cada conclusão. |
| Alto | Um erro antigo podia apagar a promessa de uma nova solicitação da mesma carta após troca de contexto. | Remoção condicional pela identidade da promessa; teste de cancelamento e solicitação imediata na nova tela. |
| Alto | `persistentWriteScheduled` voltava a false antes do fim da conversão e gravação, permitindo encoders concorrentes. Bitmap só fechava no caminho feliz. | Serialização até o `finally`; fechamento do bitmap também se `drawImage` falhar. |
| Médio | Deck padrão e validação eram recalculados no render do componente principal; uma nova referência de deck invalidava as memoizações de listas. | Memoização do deck ativo e da validação com dependências de dados, preservando edição/troca de herói. |
| Médio | `pointerover` dentro da mesma carta removia e reaplicava os marcadores dos vizinhos. | Retorno antecipado para o mesmo alvo; atualização dos vizinhos quando a mão muda e limpeza se a carta sair do DOM. |
| Médio | CI executava a suíte duas vezes, typechecks IA/online três vezes e benchmark duas vezes por chamar `vercel-build` depois das mesmas etapas. `npm test` também exigia build Vinext. | CI usa `build:next` depois das validações; Vercel mantém seus gates completos; `npm test` executa os testes e typechecks sem build. |

## Arquivos e escopo

- `app/presentation/cards/remote-card-art.tsx`: fila, cache, descarte e recursos nativos, compartilhados por menu, coleção, setup, preview e partida.
- `app/presentation/runtime/match-loading-runtime.tsx`: ciclo de vida do gate de carregamento.
- `app/presentation/runtime/hand-ai-ui-runtime.tsx`: atualizações de hover e vizinhança sem leitura de geometria.
- `app/page.tsx`: referências estáveis para deck e listas.
- `package.json`, `.github/workflows/ci.yml`: separação entre testes e build, eliminação de gates duplicados.
- `tests/card-art-lifecycle.test.mjs`, `tests/match-loading-lifecycle.test.mjs` e helper: execução dos módulos reais em ambiente controlado.

A revisão encontrou memoização das listas filtradas, `useDeferredValue` na busca, relógios locais, observadores compartilhados, preload dos dois decks e cleanup de apresentação já existentes. Foram preservados. Não houve alteração de CSS, dimensões visuais, comandos online, prioridade, combate, evolução ou regras. O preload continua cobrindo o universo da partida; a liberação do overlay continua condicionada às mãos iniciais, enquanto demais artes podem completar progressivamente.

## Testes: qualidade e execução

12 testes comportamentais novos verificam limites mobile/desktop, prioridade de uma carta selecionada, reutilização entre cópias/telas, cancelamento de trabalho antigo, retry após falha, fechamento de bitmap, encoder serial, descarte de cache, retenção compacta e ciclo de vida do loading. O helper transpila o módulo real uma vez por processo e isola seu estado por cenário; não adiciona exports ou código de teste ao runtime. Não usa rede nem espera de tempo real.

Dois testes baseados apenas na presença de trechos de código foram removidos; as verificações de readiness do loading foram substituídas por execução comportamental, mantendo as checagens de acessibilidade. O contrato de build online agora verifica a composição `vercel-build → test:rules → typecheck:online`.

| Comando | Uso |
| --- | --- |
| `npm test` / `npm run test:rules` | Estado canônico, typechecks IA/online e toda a suíte Node. |
| `npm run test:presentation` | Ciclo de vida de artes/loading e contratos de interação/preload. Subconjunto explícito, não substitui a suíte completa. |
| `npm run test:node` | Toda a suíte sem repetir preparação/typechecks. |
| `npm run test:build` | Testes e build nativo Next.js. |
| `npm run build:next` | Apenas build Next, para CI que já validou os gates. |
| `npm run vercel-build` | Testes/typechecks, benchmark de IA e build Next para Vercel. |
| `npm run build` | Build Vinext/Sites existente, preservado. |

## Evidências de validação

- Base: 1.021 testes passando, 3.675 ms.
- Após refinamento: 1.031 testes passando, 3.818 ms.
- São observações locais, não benchmark estatístico; não há alegação de aceleração da suíte individual. O ganho de CI é remover execução duplicada.
- Dos 12 cenários novos, 7 falham ao executar os arquivos originais da base e todos passam com os refinamentos.
- Typechecks IA e online: aprovados.
- Build Next.js 16.2.6: aprovado.
- Benchmark IA existente: 144 cenários, gates aprovados.
- ESLint nos três runtimes alterados e novos testes/helper: aprovado.
- Typecheck global: 26 diagnósticos na base e 26 após alterações; nenhum diagnóstico novo, comparando mensagens sem posição de linha. O build já usa `ignoreBuildErrors`; esse comportamento não foi alterado.
- Ambiente local: Node 24.19.0; o workflow existente permanece em Node 22.13.0.

## Limitações e próximos focos de medição

O navegador remoto recusou `http://localhost:3000` com `ERR_BLOCKED_BY_CLIENT`. O servidor de produção iniciou, mas não houve validação visual/interativa neste ambiente. Não foram medidos tempo até a primeira carta visível, FPS, memória total do navegador, sessões longas nem multiplayer com dois clientes. Os testes mobile verificam a política de recursos; não substituem um dispositivo físico.

Resultados esperados: menos disputa de decodificação no mobile, cache de detalhe descartável, reuso entre telas e menos mutações durante hover. Nenhum percentual de redução de memória/latência é reivindicado.

Antes de promover, medir no preview em desktop e mobile: menu → coleção → setup, primeiro carregamento e repetição com cache quente, início de partidas com decks diferentes, 15–30 minutos de turnos, retorno ao menu e nova partida, além de prioridade/combate/evolução em duas sessões online. Comparar p50/p95 até artes visíveis e perfil de memória/long tasks nas mesmas condições.

Uma indisponibilidade permanente de arte ainda pode manter o loading aberto, por seu contrato atual de exigir imagens utilizáveis. Recuperação explícita de erro e retry no gate merece uma alteração própria; os refinamentos aqui corrigem replay de efeitos e retry no serviço de raster, sem relaxar esse contrato. A dívida de tipos global e a alta especificidade histórica de CSS também permanecem como trabalho separado, sem rewrite indiscriminado.

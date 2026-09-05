# Refinamento de cartas, prioridade e heróis — 05/09/2026

Base: `perf/ui-assets-test-refinement-20260904`, commit `aeeef6e1d578a9c32ad10ff5c48feca7b00d4912`, branch remota com o commit mais recente no início da revisão. Nova branch: `fix/mobile-priority-hero-details-20260905`.

## Diagnóstico e prioridades

| Prioridade | Problema observado no código | Correção |
|---|---|---|
| Crítico | Janela podia aparecer no intervalo entre atualização React e registro da animação pelo runtime | Aguardar dois frames de estabilização e os eventos reais de busy/idle; cancelar frames na troca da janela/desmontagem |
| Crítico | Clique de resposta verificava principalmente custo e velocidade, mesmo após mudanças de estado | Reconsultar `legalPriorityResponses` no snapshot atual antes de selecionar uma carta/habilidade; feedback na própria janela |
| Alto | Loading esperava as mãos, sem aguardar o preload essencial do universo da partida | Gate acompanha preload de heróis, mãos, campo, próximas duas compras de cada deck, decks extras e assets estáticos |
| Alto | Background podia competir com o grupo essencial | Iniciar background após essenciais; concorrência de raster essencial de 1 no mobile e 2 no desktop; cancelamento por contexto |
| Alto | Listener de captura substituía o popup do herói por expansão no desktop | Retirar expansão/interceptação; um componente React trata clique, Enter e Espaço com precedência do alvo válido |
| Alto | `cover` cortava o conteúdo das artes locais dos heróis fora da partida | `contain`, alinhamento inferior; leque também exibido em telas estreitas |
| Alto | Escala uniforme diminuía campo e mão no mobile | Campo e mão voltam a escala 1; slots/área de campo maiores e HUD secundário mais compacto |
| Médio | Cursor/estado do herói selecionável pouco evidente | Cursor crosshair consistente com cartas, contorno e texto “ALVO VÁLIDO”, sem depender de hover |
| Médio | Contratos antigos de teste exigiam expansão inline | Remover contratos exclusivos da expansão; testar interação e ciclo de vida observáveis |

## Implementação

A fila compartilhada já possui as quatro prioridades: foco/seleção, viewport, vizinhos e background. Esta branch conserva a reutilização de cache entre telas, os placeholders estáticos e o descarte de trabalho obsoleto da base. O universo completo de ambos os decks principais e extras continua no preload; somente o conjunto essencial bloqueia a entrada. Rasters de 144px são compartilhados, com upgrades de qualidade posteriores. Falha de asset estático deixa de ficar memorizada como sucesso permanente.

O gate de entrada também tem identificação de geração: finalizar/cancelar uma partida antiga não pode liberar o carregamento da nova. Falhas individuais de raster mantêm o caminho de fallback/retry dos componentes; mãos com pixels indisponíveis continuam bloqueando a entrada.

O escurecimento da prioridade usa um recorte na camada de fundo sobre a carta de origem identificada no campo. Não cria clones, não move cartas e não altera o stacking do campo. Mede o alvo ao abrir e em resize/scroll, agrupando leituras por frame, e remove listeners/observador ao fechar. Quando não existe carta física identificável (por exemplo, ação ainda pendente na pilha), o fundo fica inteiramente escurecido. A janela recebe foco de teclado e mantém Tab dentro dela.

O painel do herói permanece compacto; o popup existente apresenta arte, evolução, habilidades por nível e descrição. O mesmo clique escolhe o alvo quando o herói é legalmente selecionável. As regras, pagamento autoritativo, combate, protocolo online e deadlines não foram modificados.

## Validação

- `npm test`: 1.037 testes aprovados, incluindo typechecks de IA e online.
- Build Next.js de produção aprovado.
- Novos testes verificam clique/teclado/alvo, espera pelos eventos de apresentação, cancelamento de frames, gate de artes essenciais e limpeza de geração anterior.
- `tsc --noEmit` global continua com 24 erros preexistentes. Não equivale a uma checagem global verde.
- ESLint de `app/page.tsx` comparado com a base: 59 erros preexistentes em ambos, sem novas mensagens. As limitações antigas de lint/tipos não foram ocultadas com novas supressões.
- Nenhuma medição de FPS, tempo de carregamento ou memória em dispositivo real foi feita. Ganhos descritos são expectativas baseadas na eliminação de concorrência e trabalho observados no código.
- Validação visual desktop/mobile e partida online de dois clientes ainda precisam ser realizadas no preview. O navegador deste ambiente não conseguiu abrir o servidor local; o PR fica em rascunho para essa conferência.

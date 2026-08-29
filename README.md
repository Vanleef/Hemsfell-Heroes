# Hemsfell Heroes

Jogo digital de cartas ambientado no universo Hemsfell, inspirado em jogos como Hearthstone, Legends of Runeterra, Magic: The Gathering Arena e Yu-Gi-Oh!.

O projeto oferece partidas contra IA e multiplayer por salas, seleção de heróis e decks, mulligan, energia principal e reserva, fases de turno, combate com escolha de defensor, janelas de resposta, evolução de heróis, Deck Extra de Imagens e um motor modular para custos, alvos, efeitos, gatilhos e palavras-chave.

- Aplicação em produção: https://hemsfell.dealradar.games/
- Repositório: https://github.com/Vanleef/Hemsfell-Heroes
- Branch oficial: `main`
- Catálogo visual: PDF configurado no servidor e renderizado sob demanda pelo cliente

> O jogo continua em desenvolvimento. Mudanças de regra devem ser acompanhadas por testes automatizados no motor de regras.

## Sumário

1. [Primeiros 15 minutos](#primeiros-15-minutos)
2. [Tecnologias](#tecnologias)
3. [Como executar localmente](#como-executar-localmente)
4. [Arquitetura](#arquitetura)
5. [Estado e fluxo de uma partida](#estado-e-fluxo-de-uma-partida)
6. [Motor de regras](#motor-de-regras)
7. [Cartas e catálogo](#cartas-e-catálogo)
8. [Multiplayer](#multiplayer)
9. [Testes e simulações](#testes-e-simulações)
10. [Como implementar cartas e mecânicas](#como-implementar-cartas-e-mecânicas)
11. [Documentos de design e implementação](#documentos-de-design-e-implementação)
12. [Boas práticas para contribuição](#boas-práticas-para-contribuição)

## Primeiros 15 minutos

1. Rode `npm ci`, copie a configuração mínima `HEMSFELL_ROOM_STORE=memory` para `.env.local` e inicie com `npm run dev`.
2. Abra o tutorial no menu principal para conhecer turno, prioridade, pilha, combate e controles.
3. Leia [a arquitetura atual](docs/architecture.md) e [as regras do motor](docs/rules-engine.md).
4. Use `app/rules-engine/engine.mjs` como fachada do motor e `tests/rules-engine.test.mjs` como catálogo de comportamento esperado.
5. Antes de alterar prioridade ou online, leia [o fluxo de prioridade](docs/online-priority-flow-rework.md) e [a implementação autoritativa](docs/online-priority-implementation.md).
6. Valide alterações com `npm run typecheck:ai`, `npm run typecheck:online`, `npm run test:node` e `npm run vercel-build`.

Regra mental: a UI envia **comandos**, o motor valida e produz **estado + eventos**, e a camada de apresentação mostra apenas resultados confirmados.

## Tecnologias

- Next.js 16 com App Router
- React 19
- TypeScript
- Node.js 22
- Motor de regras em módulos JavaScript ESM
- PDF.js para renderização das cartas
- Supabase REST ou Vercel Blob para persistência das salas
- Armazenamento em memória durante desenvolvimento
- Node Test Runner para testes automatizados
- Vinext/Vite e Cloudflare como pipeline alternativo
- GitHub Actions para testes e build contínuos

## Requisitos

Instale:

- Node.js `22.13.0` ou superior
- npm compatível com o Node instalado
- Git
- Bash para os scripts auxiliares do projeto

Verifique o ambiente:

```bash
node --version
npm --version
git --version
```

No Windows, prefira Git Bash ou WSL para executar scripts `.sh`. O servidor Next.js também pode ser iniciado normalmente pelo PowerShell com `npm run dev`.

## Como executar localmente

### 1. Clonar o repositório

```bash
git clone https://github.com/Vanleef/Hemsfell-Heroes.git
cd Hemsfell-Heroes
```

### 2. Selecionar a branch

Para usar a versão oficial:

```bash
git switch main
git pull origin main
```

Para uma mudança, crie uma branch focada a partir da principal:

```bash
git switch -c feat/minha-mudanca
```

### 3. Instalar dependências

Para desenvolvimento local:

```bash
npm install
```

Para uma instalação reproduzível baseada no `package-lock.json`:

```bash
npm ci
```

O script `npm run install:ci` pertence ao pipeline Vinext/Sites e valida cache, integridade e ambiente Linux. Para o desenvolvimento comum, `npm install` ou `npm ci` são suficientes.

### 4. Configurar o ambiente

Crie `.env.local` na raiz. Para jogar contra IA, nenhuma integração externa é obrigatória.

Configuração mínima para desenvolvimento:

```dotenv
HEMSFELL_ROOM_STORE=memory
```

### 5. Iniciar o servidor

```bash
npm run dev
```

Abra:

```text
http://localhost:3000
```

O comando executa `next dev -H 0.0.0.0`, permitindo acesso pela máquina local e, quando a rede/firewall permitirem, por outros dispositivos da rede.

### 6. Validar antes de enviar alterações

```bash
npm run test:rules
npm run vercel-build
```

Para a validação mais ampla do pipeline alternativo:

```bash
npm test
```

## Variáveis de ambiente

Nunca commite chaves reais. Use `.env.local` localmente e configure Production, Preview e Development separadamente na Vercel.

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `HEMSFELL_ROOM_STORE` | Em desenvolvimento | Use `memory` para salas efêmeras locais. |
| `SUPABASE_URL` | Produção com Supabase | URL do projeto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Produção com Supabase | Chave privada usada apenas no servidor. Nunca exponha no cliente. |
| `SUPABASE_SECRET_KEY` | Alternativa | Nome alternativo aceito pelo armazenamento. |
| `BLOB_READ_WRITE_TOKEN` | Produção com Blob | Token do Vercel Blob usado quando Supabase não está configurado. |
| `NEXT_PUBLIC_SUPABASE_URL` | Somente se necessário no cliente | Não substitui `SUPABASE_URL` no armazenamento de salas. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Somente recursos públicos | Chave anônima; não use como service role. |

Ordem de armazenamento das salas:

1. Memória, quando `NODE_ENV=development` ou `HEMSFELL_ROOM_STORE=memory`.
2. Supabase, quando URL e chave privada estão configuradas.
3. Vercel Blob, quando `BLOB_READ_WRITE_TOKEN` está configurado.
4. Erro explícito em produção quando nenhum armazenamento durável está disponível.

## Comandos disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o Next.js em desenvolvimento na porta 3000. |
| `npm run vercel-build` | Executa testes de regras e o build nativo do Next.js. |
| `npm run test:rules` | Executa a suíte principal do motor de regras. |
| `npm run test` | Executa build verificado e todos os arquivos `tests/*.test.mjs`. |
| `npm run build` | Executa o build Vinext limitado por timeout e valida o artefato. |
| `npm run lint` | Executa ESLint pelo ambiente auxiliar do projeto. |
| `npm run audit:cards` | Audita cobertura e classificação das cartas. |
| `npm run simulate:headless` | Executa simulações sem interface. |
| `npm run dev:vinext` | Inicia o pipeline Vite/Vinext alternativo. |
| `npm run check:vinext` | Valida compatibilidade com Vinext. |
| `npm run db:generate` | Gera artefatos Drizzle do banco alternativo. |
| `npm run validate:artifact` | Valida o resultado produzido pelo pipeline de build. |

## Arquitetura

### Visão geral

```mermaid
flowchart TB
    viewLayer["View e Presentation"] --> appLayer["Application e Session"]
    appLayer --> rulesLayer["Model e Rules Engine"]
    catalogLayer["Data e Catalog"] --> rulesLayer
    infraLayer["Infrastructure"] --> rulesLayer
    rulesLayer --> resultState["Estado e eventos"]
    resultState --> viewLayer
```

### Arquivos e responsabilidades

| Área | Arquivos principais | Responsabilidade |
| --- | --- | --- |
| Shell legado | `app/page.tsx`, `app/layout.tsx` | Orquestra a tela principal e a ordem global dos runtimes. Preserve seus contratos durante refactors. |
| Modelo | `app/model/game-state.ts` | Contratos compartilhados de carta, instância, jogador, combate e partida. |
| Motor | `app/rules-engine/engine*.mjs`, `commands/`, `state/`, `effects.mjs`, `targeting.mjs` | Valida comandos, paga custos e produz estado/eventos. |
| Prioridade e combate | `priority-state.mjs`, `priority.mjs`, `combat.mjs`, `online-*.mjs` | Pilha LIFO, janelas de resposta, checkpoints e resolução. |
| IA e simulação | `ai.mjs`, `simulator.mjs` | Escolha de comandos legais e execução headless determinística e limitada. |
| Aplicação e sessão | `app/application/`, `app/online-*.tsx`, `app/match/` | Despacha intenções, mantém sessão, reconecta e orienta snapshots. |
| Apresentação | `app/presentation/`, `app/presentation-*.{ts,tsx}`, `app/game-presentation-runtime.tsx` | Converte alterações confirmadas em cues e animações sem controlar regras. |
| Catálogo | `app/data/catalog/`, `cards.generated.json`, `card-rules.mjs`, `subtypes.mjs`, `hero-evolution.mjs` | Templates de cartas, exceções explícitas, subtipos e evolução. |
| Tutorial/glossário | `tutorial-screen.tsx`, `tutorial-content.ts`, `game-glossary.ts` | Interface didática e texto canônico de palavras-chave. |
| Artes | `remote-card-art.tsx`, `app/api/hemsfell-card-catalog.pdf/` | Cache e renderização das páginas reais do catálogo PDF. |
| Online/API | `app/api/rooms/` | Máquina autoritativa, revisões, privacidade, validação e persistência. |
| Infraestrutura | `app/infrastructure/`, `app/api/`, `scripts/`, `tests/`, `db/`, `worker/` | Persistência, HTTP, build, auditoria, simulação e regressão. |

O detalhamento de dependências, fluxos PvAI/Online e limites de extração está em [docs/architecture.md](docs/architecture.md). `app/page.tsx` ainda contém integração legada; novas regras pertencem ao motor, enquanto a página deve apenas transformar interação em intenção e renderizar o resultado.

## Estado e fluxo de uma partida

O estado contém dois jogadores e informações compartilhadas:

- jogador ativo;
- fase e rodada;
- vida, energia principal e reserva;
- mão, deck, Deck Extra, campo, auxiliares, terreno, cemitério e Obscuro;
- nível e progresso do herói;
- marcadores e usos por turno;
- ação de combate;
- ação pendente e janela de resposta;
- decisão pendente;
- timers;
- log e vencedor.

Fluxo normal:

1. Criação da partida.
2. Escolha de decks.
3. Cara ou coroa.
4. Mulligan.
5. Manutenção.
6. Fase principal.
7. Combate.
8. Finalização.
9. Troca do jogador ativo.

Ações importantes são comandos. Exemplos:

```js
{ type: "playCard", owner: 0, cardId: "p117", slot: 2 }
{ type: "activate", owner: 0, sourceId: "unit-123", abilityId: "activated-0" }
{ type: "declareAttack", owner: 0, attackerId: "unit-123" }
{ type: "selectDefender", owner: 1, attackerId: "unit-123", defenderId: "unit-456" }
{ type: "passPriority", owner: 1 }
{ type: "resolveDecision", owner: 0, targetIds: ["unit-456"] }
```

No multiplayer, o cliente deve enviar intenção, não substituir livremente o estado. A máquina da sala executa o mesmo motor usado nos testes.

Uma ação respondível abre uma janela de prioridade. Uma nova ação zera a sequência de passes; dois passes consecutivos resolvem **somente o topo** da pilha LIFO. A resolução pode gerar triggers e abrir outra janela antes que o jogo continue. Na Finalização, a energia elegível vai para a Reserva antes da limpeza e da troca do jogador ativo.

## Motor de regras

### Componentes

Uma carta é composta por habilidades; uma habilidade possui:

- `trigger`: momento em que entra na pilha;
- `costs`: custos pagos antes da resolução;
- `effects`: primitivas executadas em ordem;
- `condition`: condição passiva;
- `usageLimit`: limite por turno ou período;
- `availability`: condição para mostrar/permitir ativação.

Exemplo conceitual:

```js
{
  trigger: "onEnter",
  costs: [],
  effects: [
    { type: "damage", amount: 2, target: "anyCreature", selections: 1 }
  ]
}
```

O caminho esperado é:

```text
catálogo/texto -> compiler -> command -> validation -> costs -> effects/triggers
                 -> state-based actions -> novo estado + eventos -> apresentação
```

`engine.mjs` é a fachada pública instrumentada, `engine-core.mjs` implementa a execução e `engine-base.mjs` fornece operações fundamentais. Evite importar detalhes internos quando a fachada já expõe o contrato necessário.

### Triggers comuns

- `onPlay`: carta jogada.
- `onEnter`: Primeiro Ato/entrada em campo.
- `onDestroyed`: Último Suspiro.
- `onCreatureDestroyed`: outra criatura destruída.
- `onSpellCast`: feitiço conjurado.
- `onDamageTaken`: criatura recebeu dano e sobreviveu.
- `onCombatStart`: início do combate.
- `onCombatKill`: criatura destruiu outra em combate.
- `onMaintenance`: início da manutenção.
- `onTurnEnd`: fim do turno.
- `activated`: habilidade iniciada manualmente.

### Primitivas

`effects.mjs` concentra operações reutilizáveis. Antes de criar lógica específica, verifique se a regra pode ser expressa por composição de:

- `damage`, `damageAll` e dano adjacente;
- `heal` e `loseLife`;
- `draw`, `discard` e `mill`;
- `modifyStats`, modificadores condicionais e temporários;
- `grantKeyword`, `tap` e `ready`;
- `destroy`, `sacrifice`, `banish` e `returnToHand`;
- `addMarker`, remoção e duplicação de marcadores;
- `createImage`, busca e ressurreição;
- decisões, escolhas e efeitos atrasados.

Se uma mecânica é reutilizável por mais de uma carta, implemente uma primitiva genérica. Regras altamente particulares podem entrar como dados explícitos em `card-rules.mjs`.

### Alvos

O motor diferencia:

- qualquer personagem: criaturas e heróis;
- qualquer criatura;
- criatura aliada;
- criatura inimiga;
- qualquer constante;
- constante aliada;
- constante inimiga;
- efeitos globais sem seleção.

Primeiro Ato nunca impede a criatura de entrar por falta de alvo. A criatura entra e o trigger é ignorado quando não existe uma combinação válida.

Barreira Mágica bloqueia seleção por Feitiços e Feitiços Acelerados. Efeitos globais sem alvo continuam funcionando.

### Custos e energia

- Criaturas usam apenas energia principal.
- Feitiços, Acelerados, Artefatos, Encantos, Terrenos e evolução podem usar energia principal e reserva.
- Custos de `Vire`, marcadores, vida e sacrifício são validados antes da ativação.
- Um efeito ativável só pode ser usado quando todos os custos podem ser pagos.
- Limites por turno ficam em `abilityUses` e são reiniciados no momento apropriado.

### Zonas e limpeza

Quando uma criatura sai do campo:

- estados como virada, enjoo e dano não acompanham a carta;
- modificadores e palavras-chave concedidas são removidos;
- o nome volta ao nome do catálogo;
- artefatos vinculados saem junto;
- Imagens geradas são removidas em vez de ir ao cemitério;
- uma criatura com Vitalidade igual ou inferior a zero vai ao cemitério.

## Cartas e catálogo

Cada registro deve ter, no mínimo:

```json
{
  "page": 117,
  "id": "p117",
  "name": "Brutamontes",
  "type": "Criatura",
  "cost": 3,
  "atk": 1,
  "hp": 4,
  "text": "Atropelar. Primeiro Ato: ...",
  "tags": ["Atropelar", "Primeiro Ato"],
  "subtypes": [],
  "image": "drive://catalog/page/117",
  "hero": false,
  "imageCard": false
}
```

O campo `page` liga a carta à página do PDF universal. Por isso cada item não precisa guardar uma URL de imagem diferente.

Não edite o JSON gerado como única fonte de verdade sem verificar o processo de geração/banco. Mudanças de catálogo devem preservar IDs e páginas sempre que possível, porque partidas, testes e regras explícitas referenciam esses valores.

### Palavras-chave

Para adicionar ou corrigir uma palavra-chave:

1. confirme a regra nos documentos de design;
2. atualize a compilação/tags ou a regra explícita correspondente no motor;
3. atualize `app/game-glossary.ts`, fonte canônica da explicação exibida pela interface;
4. inclua o termo em `app/tutorial-content.ts` quando ele for essencial ao onboarding;
5. cubra interação com alvos, combate, pilha e Sufocado quando aplicável;
6. valide o mesmo comportamento no PvAI e no motor autoritativo online.

## Multiplayer

### Online 1x1 versus PvAI

| Aspecto | PvAI/local | Online 1x1 |
| --- | --- | --- |
| Autoridade | Motor local | Máquina da sala no servidor |
| Fonte da decisão adversária | `ai.mjs` | Comando do outro cliente |
| Sincronização | Imediata no mesmo processo | Revisões persistidas e snapshots orientados |
| Informação privada | Mantida no estado local | Filtrada pelo servidor antes do snapshot |
| Reconexão | Não se aplica | Recupera a revisão confirmada da sala |
| Prioridade | Mesmo modelo de regras, ritmo local | Timers, auto-pass e checkpoints autoritativos |

Os dois modos compartilham o motor e os comandos. O que muda é a fonte da decisão, a autoridade e o transporte; não deve existir uma versão paralela das regras na UI online.

### Estados da sala

- `waiting`: criada, aguardando convidado.
- `deck-selection`: ambos escolhem e confirmam os decks.
- `coin-choice`: definição de quem começa.
- `mulligan`: preparação da mão.
- `started`: partida em andamento.
- `finished`: partida encerrada.

### Concorrência

Cada sala possui `revision`. Escritas carregam a revisão esperada; versões antigas recebem conflito em vez de sobrescrever uma ação mais recente. Isso evita perda silenciosa de atualização em requisições simultâneas.

### Privacidade

O servidor remove a identidade das cartas nas zonas privadas do oponente:

- mão;
- deck;
- Deck Extra.

Ao receber uma sincronização do cliente, o servidor preserva os dados privados canônicos que não deveriam ter sido conhecidos pelo adversário.

### Desenvolvimento local

Use:

```dotenv
HEMSFELL_ROOM_STORE=memory
```

As salas desaparecem quando o processo reinicia e não são compartilhadas entre instâncias.

### Produção com Supabase

Configure no servidor:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_PRIVADA
```

A tabela esperada é `multiplayer_rooms`, com pelo menos:

- `id`;
- `payload`;
- `revision`;
- `updated_at`.

A service role deve existir somente no backend. RLS pode permanecer habilitado para clientes públicos, pois a escrita da sala ocorre pela API do servidor.

## Artes das cartas

`RemoteCardArt` solicita `/api/hemsfell-card-catalog.pdf`. A rota do servidor entrega ou redireciona para o PDF configurado.

O cliente:

1. importa PDF.js apenas quando necessário;
2. configura o worker;
3. mantém uma Promise única do documento;
4. armazena Promises de páginas em cache;
5. renderiza cada página em canvas;
6. limpa o cache quando o carregamento falha.

Se aparecer apenas o verso da carta com o custo:

1. abra o console e a aba Network;
2. verifique `/api/hemsfell-card-catalog.pdf`;
3. confirme que a resposta é PDF e não HTML/JSON de erro;
4. confirme o ID e as URLs em `app/api/hemsfell-card-catalog.pdf/route.ts`;
5. confirme se o Google Drive permite acesso público ao arquivo;
6. teste local e produção separadamente.

## Testes e simulações

A suíte principal está em `tests/rules-engine.test.mjs` e cobre:

- custos e ativação;
- alvos;
- Primeiro Ato e Último Suspiro;
- palavras-chave;
- artefatos;
- Imagens;
- energia reserva;
- combate;
- prioridade;
- multiplayer autoritativo;
- cartas complexas;
- prevenção de loops;
- simulações headless.

Execute um teste isolado:

```bash
node --test --test-name-pattern="Brutamontes" tests/rules-engine.test.mjs
```

Execute todos:

```bash
npm run test:node
```

Typechecks por domínio:

```bash
npm run typecheck:ai
npm run typecheck:online
```

Audite cartas:

```bash
npm run audit:cards
```

Execute simulações:

```bash
npm run simulate:headless
```

O CI em `.github/workflows/ci.yml` executa em pushes das branches principais de trabalho e em pull requests para `main`.

## Como implementar cartas e mecânicas

### Carta simples

1. Confirme nome, tipo, custo, atributos, texto, página e subtipos.
2. Verifique como `compiler.mjs` interpreta o texto.
3. Reutilize primitivas existentes.
4. Adicione um teste com estado mínimo.
5. Teste ausência e presença de alvos.
6. Valide custo e destino da carta.
7. Execute testes e build.

### Carta complexa

1. Adicione uma definição em `card-rules.mjs`.
2. Divida o comportamento em triggers, custos e efeitos.
3. Implemente uma primitiva em `effects.mjs` apenas se ela for reutilizável.
4. Adicione decisão no motor quando exigir escolha.
5. Faça a UI apenas renderizar a decisão presente no estado.
6. Garanta que a máquina multiplayer aceite o mesmo comando.
7. Escreva testes para zero, um e vários alvos, além de condições inválidas.

Exemplo:

```js
p117: [
  ability("static", [
    effect("keyword", { keyword: "Atropelar" })
  ]),
  ability("onEnter", [
    effect("optionalSacrificeBuff", {
      maximum: 3,
      attackPerCreature: 2
    })
  ])
]
```

### Nova primitiva

Ao criar `effect("novoEfeito")`:

1. implemente `defaultEffectHandlers.novoEfeito`;
2. decida se é imediato ou abre `pendingDecision`;
3. valide alvos e custos no servidor;
4. proteja repetições com limite;
5. execute limpeza de criaturas com zero de Vitalidade;
6. emita eventos necessários;
7. adicione testes unitários;
8. confirme que `canExecuteCard` reconhece o efeito.

### Novo herói ou deck

1. adicione o herói ao catálogo;
2. registre o deck e seu intervalo/lista;
3. configure nome, facção, estilo, cor e requisitos;
4. implemente níveis como habilidades estruturadas;
5. adicione Imagens ao Deck Extra;
6. inclua o ID em validações multiplayer;
7. teste evolução, reset por turno e sincronização.

### Checklist de regra

- A carta pode ser jogada neste momento?
- Há espaço na zona correta?
- A energia e a reserva foram calculadas corretamente?
- Custos extras podem ser pagos?
- O efeito realmente exige alvo?
- Existem alvos válidos?
- Primeiro Ato deve ser ignorado sem alvo?
- O efeito é temporário, de combate ou permanente?
- A carta precisa abrir janela de resposta?
- O efeito dispara eventos passivos?
- A carta vai para cemitério, Obscuro, mão ou é removida?
- Artefatos continuam ligados à criatura?
- Informações privadas permanecem ocultas no multiplayer?
- A operação é limitada e não cria loop infinito?

## Documentos de design e implementação

- [Arquitetura atual e direção de dependências](docs/architecture.md)
- [Motor de regras](docs/rules-engine.md)
- [Fluxo de prioridade online](docs/online-priority-flow-rework.md)
- [Implementação de prioridade online](docs/online-priority-implementation.md)
- [Sistema de apresentação e animações](docs/presentation-system.md)
- [Limites do refactor estrutural de front-end](docs/frontend-structure-refactor.md)
- [Roadmap de qualidade do jogo web](docs/web-card-game-quality-roadmap.md)
- [Auditoria de autoridade online](docs/online-authority-audit-2026-08-19.md)

## Deploy

### Vercel

1. Importe o repositório na Vercel.
2. Selecione a branch de produção.
3. Use o preset Next.js.
4. Configure `npm run vercel-build` como build quando necessário.
5. Cadastre variáveis de ambiente.
6. Faça o deploy.
7. Verifique logs das Functions e o endpoint do PDF.

Produção precisa de Supabase ou Vercel Blob para salas persistentes. O modo memória não é adequado para múltiplas instâncias serverless.

### GitHub Actions

O workflow de CI valida cada mudança relevante. Antes do merge, confirme:

- testes verdes;
- build verde;
- nenhuma chave no diff;
- nenhuma alteração acidental no catálogo;
- testes novos para regras novas.

## Diagnóstico de problemas

### Erro 500 ao abrir a aplicação

```bash
npm run vercel-build
```

Verifique o primeiro erro de TypeScript, CSS, importação ou rota. Não corrija apenas mensagens posteriores em cascata.

### CSS: “Missing opening {”

Inspecione a folha citada pelo build e a ordem de imports em `app/layout.tsx`. Normalmente existe:

- seletor sem abertura;
- chave de fechamento excedente;
- bloco inserido fora de um seletor;
- conflito de merge.

### Sala não pode ser criada

Confirme:

- local: `HEMSFELL_ROOM_STORE=memory`;
- produção: Supabase ou Blob;
- tabela `multiplayer_rooms`;
- variáveis disponíveis no ambiente correto da Vercel;
- novo deploy após alterar variáveis.

### Dois jogadores ficam aguardando prioridade

Inspecione:

- `pendingAction`;
- `pendingResponse`;
- proprietário de `responder`;
- contador de passes;
- revisão da sala;
- comandos `passPriority`;
- espelhamento host/guest.

Nunca resolva um lock apenas escondendo o modal. O estado autoritativo deve concluir ou avançar a ação.

### Carta pede alvo incorretamente

Verifique:

- trigger correto;
- `targetPolicy`;
- número de `selections`;
- escopo;
- disponibilidade real;
- se é efeito global;
- se o Primeiro Ato deveria ser ignorado.

### Artefato desaparece

Confirme:

- tipo `Artefato`;
- criatura anfitriã válida;
- mesmo slot visual;
- `attachedTo`;
- espaço auxiliar livre;
- permanência após resolução;
- remoção apenas quando o anfitrião sair ou um efeito mandar.

## Boas práticas para contribuição

1. Crie uma branch específica.
2. Evite misturar refatoração ampla com correção de uma carta.
3. Preserve alterações não relacionadas.
4. Modele regras no motor, não apenas na interface.
5. Não confie no texto da UI como validação multiplayer.
6. Use IDs estáveis.
7. Escreva testes antes ou junto da correção.
8. Execute testes e build.
9. Faça commits descritivos.
10. Abra PR para `main` com cenários testados.

Formato sugerido de commit:

```text
fix(rules): prevent invalid First Act target lock
feat(cards): implement optional Brutamontes sacrifices
test(multiplayer): cover defender decision flow
docs: expand contributor setup and architecture
```

## Segurança

- Nunca exponha service role no navegador.
- Nunca aceite estado multiplayer sem validação.
- Preserve limites de payload e profundidade.
- Bloqueie chaves perigosas de protótipo.
- Não envie mão, deck ou Deck Extra reais ao oponente.
- Mantenha headers de segurança.
- Revise dependências e lockfile.
- Não use dados enviados pelo cliente como autoridade de regra.

## Estado atual

O projeto possui motor modular e testes automatizados, mas ainda mantém partes legadas em `app/page.tsx`. O objetivo arquitetural é continuar movendo regras para comandos, habilidades e efeitos reutilizáveis, mantendo o servidor como autoridade no multiplayer.

Ao entrar no projeto, comece nesta ordem:

1. este README;
2. `docs/architecture.md`;
3. `tests/rules-engine.test.mjs`;
4. `app/rules-engine/engine.mjs`;
5. `app/rules-engine/card-rules.mjs` e `effects.mjs`;
6. `app/api/rooms/machine.ts`;
7. `app/presentation-event-bridge.tsx`;
8. `app/page.tsx` e, por último, a cascata CSS importada por `app/layout.tsx`.

Essa ordem mostra primeiro o comportamento esperado, depois as regras e, por último, a interface.

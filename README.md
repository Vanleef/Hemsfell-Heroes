# Hemsfell Heroes

Hemsfell Heroes é um jogo de cartas digital em construção, inspirado em jogos de CCG/TCG como Legends of Runeterra e Hearthstone. Cada herói traz um estilo de jogo próprio, com cards de criatura, feitiço, artefato, encanto e terreno cruel, além de um deck extra de imagens que pode ser invocado durante a partida.

Neste repositório, o jogo roda em uma aplicação React + Next/Vite com suporte a partidas contra IA e multiplayer local via salas em memória.

## O jogo

- Dois heróis se enfrentam em um duelo de cartas.
- Cada jogador começa com 30 de vida e gerencia energia, reserva e cartas na mão.
- Criaturas podem atacar, bloquear, usar keywords como Investida, Atropelar, Veloz e Furtivo.
- Heróis têm habilidades especiais e evolução por experiência.
- Efeitos de cartas podem invocar imagens, manipular o deck, causar dano e gerar recursos.
- O projeto ainda está em desenvolvimento e implementa várias mecânicas por meio do interpretador de texto de cartas.

## Como executar localmente

### Requisitos

- Node.js 24 ou superior
- npm disponível no PATH

### Instalação

No diretório do projeto:

```bash
npm install
```

### Iniciar em modo de desenvolvimento

```bash
npm run dev
```

Após o servidor iniciar, abra o navegador em `http://localhost:5173` ou no endereço mostrado no terminal.

## Como testar

### Verificar tipos TypeScript

```bash
npm exec -- tsc --noEmit
```

### Executar a validação de build/teste do repositório

```bash
npm test
```

Esse comando executa o build e valida o HTML renderizado do projeto.

## Como jogar

- No menu, escolha `Entrar em batalha` para enfrentar a IA.
- Se quiser testar multiplayer local, crie uma sala ou entre em uma sala existente.
- Selecione o deck/herói e confirme a seleção.
- No jogo, use o painel para jogar cartas, declarar combates e ativar habilidades.

## Estrutura principal

- `app/page.tsx` — lógica principal do jogo e interface do cliente.
- `app/cards.generated.json` — catálogo de cartas usado pelo jogo.
- `app/api/rooms/` — API de sala multiplayer em memória.
- `db/index.ts` — adaptador D1/Drizzle para integração com Cloudflare Workers.
- `worker/index.ts` — ponto de entrada do worker usado pelo projeto.
- `types/cloudflare-workers.d.ts` — tipos customizados para o ambiente de runtime.

## Scripts úteis

- `npm run dev` — inicia o servidor de desenvolvimento.
- `npm run build` — produz o build de produção e valida o artefato.
- `npm run start` — inicia a versão construída.
- `npm test` — validações e build de teste.
- `npm run install:ci` — instalação com lockfile para CI.

## Observações

- O multiplayer atual usa rooms em memória, portanto as salas são efêmeras e funcionam apenas enquanto o servidor estiver rodando.
- Se você quiser contribuir, comece por `app/page.tsx` e pelos handlers em `app/api/rooms`.
- O projeto ainda não possui cobertura de teste completa para toda a lógica de cartas, então a validação de build e `tsc` são as formas principais de checar mudanças.

# Status da reorganização arquitetural

Esta branch move implementações soltas para núcleos coesos sem alterar regras, timing, seletores ou ordem de efeitos. Mudanças visuais intencionais ficam isoladas; nesta etapa, a única reformulação de UX é o tutorial mais curto e objetivo.

## Núcleos canônicos já estabelecidos

- `app/rules-engine/cards/`: ativação e semântica de palavras-chave de cartas.
- `app/rules-engine/game-rules.mjs`: regras puras compartilhadas.
- `app/model/decks/`: modelo, validação e expansão de UserDeck.
- `app/application/session/`: sessão e orientação de snapshots Online.
- `app/application/online/`: HUD/snapshot Online e reconexão.
- `app/infrastructure/auth/`: autenticação dependente do framework.
- `app/presentation/combat/`: snapshots e descrições de apresentação de combate.
- `app/presentation/cards/`: renderização de arte e runtime de preview de cartas.
- `app/presentation/cues/`: cues visuais de ações.
- `app/presentation/runtime/`: bloqueio visual e resolução ordenada das animações.
- `app/presentation/match/`: runtime de apresentação específico da UI da partida.
- `app/presentation/setup/`: normalizações de apresentação/setup.
- `app/presentation/glossary/`: sincronização do glossário com os elementos semânticos da interface.
- `app/presentation/tutorial/`: tela do tutorial.
- `app/presentation/styles/`: ponto canônico dos estilos de Match UI, Online, apresentação, command bar e tutorial usados por `layout.tsx`.
- `app/data/content/`: glossário e conteúdo estruturado do tutorial.

## Tutorial

O onboarding foi reduzido de cinco áreas densas e sete capítulos ilustrados para três seções:

1. **Como jogar** — objetivo, recursos, quatro etapas do turno e seis interações essenciais.
2. **Combate** — fluxo unitário atual: declarar um atacante, responder, escolher bloqueio e resolver dano.
3. **Referência** — zonas, tipos de carta e somente as palavras-chave mais frequentes.

O tutorial não tenta mais substituir o manual. Definições completas continuam vindo do glossário canônico e aparecem nos tooltips durante a partida.

## Raiz do App Router

A raiz de `app/` contém somente `layout.tsx`, `page.tsx` e `globals.css`. Runtimes, modelos, catálogo, conteúdo e estilos são consumidos diretamente de suas camadas; não permanecem fachadas de compatibilidade na raiz.

## Próxima ordem segura

1. Reduzir `app/page.tsx` por responsabilidade — setup, coleção, partida e modais — nunca por divisão mecânica do arquivo.
2. Manter os contratos do App Router e a ordem global dos runtimes durante essas extrações.

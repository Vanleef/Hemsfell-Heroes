# Status da reorganização arquitetural

Esta branch move implementações soltas para núcleos coesos sem alterar regras, timing, seletores, ordem de efeitos ou contratos visuais.

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
- `app/presentation/runtime/`: coordenação de bloqueios exclusivamente visuais.
- `app/presentation/setup/`: normalizações de apresentação/setup.

## Compatibilidade temporária

Alguns arquivos históricos na raiz de `app/` continuam existindo como fachadas ou, quando testes de regressão inspecionam seu texto bruto, como fontes de compatibilidade byte-equivalentes. Isso é deliberado: o caminho canônico novo define a responsabilidade arquitetural, enquanto o caminho antigo preserva consumidores legados até a migração completa.

Não remover uma fonte de compatibilidade só porque buscas por import não retornam consumidores. Há testes estáticos e contratos de build que verificam conteúdo e ordem diretamente.

## Próxima ordem segura

1. Consolidar glossário e conteúdo do tutorial em `app/data/content/`.
2. Agrupar runtimes de glossário/tutorial em `app/presentation/`.
3. Migrar o bridge e o runtime central de apresentação somente depois de atualizar os testes de contrato que leem caminhos históricos.
4. Tratar CSS em etapa separada, preservando integralmente cascata, ordem de imports, seletores e valores.
5. Reduzir `app/page.tsx` por responsabilidade, nunca por divisão mecânica do arquivo.

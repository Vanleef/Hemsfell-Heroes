# Catálogo de conteúdo no D1

O D1 é a fonte de dados editável pelo navegador: abra **Cloudflare Dashboard → Workers & Pages → D1 → DB → Tables**. Não exponha tokens de administração no cliente.

## Modelo

- `card_sets`: uma coleção e seu único `cards_pdf_url`.
- `cards`: dados de jogo e `art_page`; nenhuma carta repete o link do PDF.
- `heroes`: evolução, habilidades e apresentação.
- `decks` e `deck_cards`: listas por ID estável, com zona `main` ou `extra`.
- `content_revisions`: histórico que a futura área administrativa poderá registrar.

`rules_text` é o texto exibido ao jogador. `effects` contém JSON de regras estruturadas, por exemplo:

```json
[{ "trigger": "onPlay", "kind": "damageAllCreatures", "amount": { "kind": "enemyCreatureCount" } }]
```

Assim, uma carta nova normalmente é adicionada no banco sem mudar o motor. Só um novo `kind` de efeito exige código.

## Aplicar e preencher

1. Execute as migrations do D1 com o fluxo de deploy do projeto.
2. Gere o seed: `node scripts/seed-card-catalog.mjs`.
3. Importe `drizzle/seeds/hemsfell-core.sql` no console SQL do D1.
4. Revise `effects`, heróis e decks no dashboard antes de publicar.

A importação preserva `legacy_page` para rastrear o PDF atual, mas o jogo deve passar a usar `cards.id` para referências novas.

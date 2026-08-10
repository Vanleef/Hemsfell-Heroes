# Catálogo de cartas no Supabase

O catálogo usa **Supabase Postgres**, no plano gratuito. A gestão é feita no navegador pelo painel do Supabase; o jogo só recebe leituras públicas de cartas publicadas.

## Modelo

- `card_sets`: uma coleção e seu único `cards_pdf_url`.
- `cards`: dados de jogo e `art_page`; nenhuma carta repete o link do PDF.
- `heroes`: evolução, habilidades e apresentação.
- `decks` e `deck_cards`: listas por ID estável, com zona `main` ou `extra`.
- `content_revisions`: histórico que uma futura área administrativa poderá registrar.

`rules_text` é o texto mostrado ao jogador. `effects` guarda regras estruturadas, por exemplo:

```json
[{ "trigger": "onPlay", "kind": "damageAllCreatures", "amount": { "kind": "enemyCreatureCount" } }]
```

Assim, uma carta nova normalmente é incluída no banco, sem mudança no motor. Somente um novo `kind` de efeito precisa de código.

## Configuração

1. Crie um projeto gratuito no Supabase.
2. No **SQL Editor**, execute `supabase/schema.sql`.
3. Gere o seed: `npm run catalog:seed:sql`.
4. Cole e execute `supabase/seed/hemsfell-core.sql` no SQL Editor.
5. No deploy, defina `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`.
6. Consulte `/api/catalog` para verificar a leitura remota. Se as variáveis ainda não existirem, a rota informa que o catálogo local continua ativo.

As políticas RLS liberam somente leitura de conteúdo publicado para o jogo. Escritas são feitas pelo painel do Supabase ou por um futuro painel autenticado; nunca use a chave `service_role` no navegador.

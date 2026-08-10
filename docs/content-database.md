# Catálogo de cartas no Supabase

O catálogo usa **Supabase Postgres**, no plano gratuito. A gestão é feita no navegador pelo painel do Supabase; o jogo só recebe leitura de conteúdo publicado.

## Fonte de dados no repositório

- `content/catalog.json`: coleções e o único link público do PDF de cada coleção.
- `content/heroes.json`: heróis, apresentação, progresso, habilidades e intervalo de cartas.
- `content/decks.json`: quantidades do Deck Principal por página enquanto o catálogo legado é migrado.
- `content/effect-overrides.json`: efeitos estruturados por página; uma carta nova deve usar seu ID estável no banco.
- `app/cards.generated.json`: importação inicial do PDF; não é a fonte de verdade após o Supabase estar configurado.

## Modelo no Supabase

- `card_sets`: uma coleção e seu único `cards_pdf_url`.
- `cards`: dados de jogo, `art_page`, texto e `effects`.
- `heroes`: evolução, habilidades e apresentação.
- `decks` e `deck_cards`: listas por ID estável, com zona `main` ou `extra`.
- `content_revisions`: histórico para uma futura área administrativa.

`rules_text` é o texto mostrado ao jogador. `effects` guarda regras estruturadas, por exemplo:

```json
[{ "trigger": "onPlay", "kind": "damageAllCreatures", "amount": { "kind": "enemyCreatureCount" } }]
```

Assim, uma carta nova normalmente é incluída no banco, sem mudança no motor. Somente um novo `kind` de efeito precisa de código.

## Configuração

1. Crie um projeto gratuito no Supabase.
2. No **SQL Editor**, execute `supabase/schema.sql` uma vez.
3. Gere o seed completo:

   ```bash
   npm run catalog:seed:sql
   ```

4. Cole e execute `supabase/seed/hemsfell-core.sql` no SQL Editor.
5. No deploy, defina `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`.
6. Abra `/api/catalog`: a resposta deve indicar `"source": "supabase"`.

No painel do Supabase, use **Table Editor** para editar `cards`, `heroes`, `decks` e `deck_cards`. O banco atualiza `updated_at` automaticamente. As políticas RLS liberam somente leitura de conteúdo publicado para o jogo; nunca coloque uma chave `service_role` no navegador.

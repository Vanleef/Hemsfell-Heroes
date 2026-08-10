-- Completa o Deck Extra/Imagem para todos os decks já semeados.
-- Execute após supabase/schema.sql e o seed principal.
insert into public.deck_cards (deck_id, card_id, quantity, zone)
select
  d.id,
  c.id,
  1,
  'extra'
from public.decks d
join public.heroes h on h.id = d.hero_id
join public.cards c
  on c.set_id = d.set_id
 and c.is_image_card = true
 and c.legacy_page between
   ((h.progression -> 'deckRange' ->> 'from')::integer)
   and ((h.progression -> 'deckRange' ->> 'to')::integer)
where d.id like '%-starter'
on conflict (deck_id, card_id, zone)
do update set quantity = excluded.quantity;

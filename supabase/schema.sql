-- Hemsfell Heroes content catalogue (Supabase Postgres)
create table if not exists public.card_sets (
  id text primary key,
  name text not null,
  cards_pdf_url text not null,
  released_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cards (
  id text primary key,
  set_id text not null references public.card_sets(id),
  legacy_page integer,
  name text not null,
  card_type text not null check (card_type in ('Criatura', 'Feitiço', 'Artefato', 'Encanto', 'Terreno', 'Herói')),
  faction text,
  cost integer not null default 0 check (cost >= 0),
  attack integer,
  health integer,
  rules_text text not null default '',
  tags jsonb not null default '[]'::jsonb,
  effects jsonb not null default '[]'::jsonb,
  art_page integer check (art_page is null or art_page > 0),
  is_image_card boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, legacy_page)
);

create table if not exists public.heroes (
  id text primary key,
  set_id text not null references public.card_sets(id),
  card_id text references public.cards(id),
  name text not null,
  faction text not null,
  presentation jsonb not null default '{}'::jsonb,
  progression jsonb not null default '[]'::jsonb,
  abilities jsonb not null default '[]'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decks (
  id text primary key,
  set_id text not null references public.card_sets(id),
  hero_id text not null references public.heroes(id),
  name text not null,
  format text not null default 'standard',
  is_starter boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_cards (
  deck_id text not null references public.decks(id) on delete cascade,
  card_id text not null references public.cards(id),
  quantity integer not null check (quantity > 0),
  zone text not null default 'main' check (zone in ('main', 'extra')),
  primary key (deck_id, card_id, zone)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $updated_at$
begin
  new.updated_at = now();
  return new;
end;
$updated_at$;

create table if not exists public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

drop trigger if exists card_sets_touch_updated_at on public.card_sets;
create trigger card_sets_touch_updated_at before update on public.card_sets for each row execute function public.touch_updated_at();
drop trigger if exists cards_touch_updated_at on public.cards;
create trigger cards_touch_updated_at before update on public.cards for each row execute function public.touch_updated_at();
drop trigger if exists heroes_touch_updated_at on public.heroes;
create trigger heroes_touch_updated_at before update on public.heroes for each row execute function public.touch_updated_at();
drop trigger if exists decks_touch_updated_at on public.decks;
create trigger decks_touch_updated_at before update on public.decks for each row execute function public.touch_updated_at();

alter table public.card_sets enable row level security;
alter table public.cards enable row level security;
alter table public.heroes enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.card_sets, public.cards, public.heroes, public.decks, public.deck_cards to anon, authenticated;

create policy "published sets are readable" on public.card_sets for select using (is_active);
create policy "published cards are readable" on public.cards for select using (is_published);
create policy "published heroes are readable" on public.heroes for select using (is_published);
create policy "published decks are readable" on public.decks for select using (is_published);
create policy "deck contents are readable" on public.deck_cards for select using (
  exists (select 1 from public.decks where decks.id = deck_cards.deck_id and decks.is_published)
);

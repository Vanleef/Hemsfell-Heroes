-- Execute once in Supabase SQL Editor before enabling production multiplayer.
create table if not exists public.multiplayer_rooms (
  id text primary key,
  payload text not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.multiplayer_rooms add column if not exists revision bigint not null default 0;
update public.multiplayer_rooms
set revision = coalesce(nullif(payload::jsonb->>'revision', '')::bigint, revision)
where payload is not null;

alter table public.multiplayer_rooms enable row level security;
revoke all on table public.multiplayer_rooms from anon, authenticated;

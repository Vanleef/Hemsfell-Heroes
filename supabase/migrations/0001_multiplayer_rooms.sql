-- Execute once in Supabase SQL Editor before enabling production multiplayer.
create table if not exists public.multiplayer_rooms (
  id text primary key,
  payload text not null,
  updated_at timestamptz not null default now()
);

alter table public.multiplayer_rooms enable row level security;
revoke all on table public.multiplayer_rooms from anon, authenticated;

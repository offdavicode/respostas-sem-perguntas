create table if not exists public.rooms (
  code text primary key,
  version integer not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists rooms_updated_at_idx on public.rooms (updated_at);

create table if not exists public.room_presence (
  code text not null references public.rooms (code) on delete cascade,
  player_id text not null,
  last_seen timestamptz not null default now(),
  primary key (code, player_id)
);

alter table public.rooms enable row level security;
alter table public.room_presence enable row level security;

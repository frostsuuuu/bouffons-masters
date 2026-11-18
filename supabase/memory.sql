-- =========================================================
--  MINI-JEU « MEMORY » en 1 contre 1 (le mode solo se joue sans serveur)
--  Déjà appliqué sur le projet ; ce fichier sert de référence.
--  La position des cartes reste sur le serveur : on ne voit une carte
--  que lorsqu'elle est retournée.
-- =========================================================

create table if not exists public.mm_games (
  id          uuid primary key default gen_random_uuid(),
  host        uuid not null references public.players(id) on delete cascade,
  guest       uuid not null references public.players(id) on delete cascade,
  status      text not null default 'invite' check (status in ('invite','play','done','declined','cancelled')),
  pairs       int not null check (pairs in (6, 8, 10, 15, 18)),
  layout      jsonb not null,                        -- ids des cartes, mélangés (2 × pairs) : SECRET
  matched     jsonb not null default '{}'::jsonb,    -- { "index": "host" | "guest" }
  pending     int,                                   -- 1re carte retournée du tour en cours
  turn        text not null default 'host' check (turn in ('host','guest')),
  host_score  int not null default 0,
  guest_score int not null default 0,
  last_pair   jsonb,                                 -- dernière paire retournée { i, j, ci, cj, match, by }
  seq         int not null default 0,                -- augmente à chaque carte retournée
  winner      text check (winner in ('host','guest','tie')),
  last_event  jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mm_games_host_idx  on public.mm_games(host, updated_at desc);
create index if not exists mm_games_guest_idx on public.mm_games(guest, updated_at desc);
alter table public.mm_games enable row level security;
revoke all on public.mm_games from anon, authenticated;

create or replace function public.mm_role(g public.mm_games)
returns text language plpgsql stable security definer set search_path = public as $$
declare me uuid := bm_me();
begin
  if me is null then raise exception 'NON_CONNECTE'; end if;
  if g.host = me then return 'host'; end if;
  if g.guest = me then return 'guest'; end if;
  raise exception 'NON_AUTORISE';
end $$;

create or replace function public.mm_view(g public.mm_games)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r text := mm_role(g); other uuid; opp text; m jsonb := '{}'::jsonb; k text;
begin
  other := case when r = 'host' then g.guest else g.host end;
  select pseudo into opp from players where id = other;
  for k in select jsonb_object_keys(g.matched) loop
    m := m || jsonb_build_object(k, jsonb_build_object('card', g.layout->>(k::int), 'by', case when g.matched->>k = r then 'me' else 'opp' end));
  end loop;
  return jsonb_build_object(
    'id', g.id, 'status', g.status, 'role', r, 'pairs', g.pairs,
    'opponent', jsonb_build_object('id', other, 'pseudo', opp),
    'matched', m,
    'pending', case when g.pending is null then null else jsonb_build_object('i', g.pending, 'card', g.layout->>g.pending) end,
    'last_pair', case when g.last_pair is null then null else g.last_pair || jsonb_build_object('by', case when g.last_pair->>'by' = r then 'me' else 'opp' end) end,
    'my_turn', g.status = 'play' and g.turn = r,
    'my_score', case when r = 'host' then g.host_score else g.guest_score end,
    'opp_score', case when r = 'host' then g.guest_score else g.host_score end,
    'seq', g.seq,
    'winner', case when g.winner is null then null when g.winner = 'tie' then 'tie' when g.winner = r then 'me' else 'opp' end,
    'last_event', g.last_event, 'updated_at', g.updated_at);
end $$;

-- Inviter un ami sur une grille de 6, 8, 10, 15 ou 18 paires (cartes tirées dans tout le jeu)
create or replace function public.mm_invite(p_guest uuid, p_pairs int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := bm_me(); ids jsonb; g public.mm_games;
begin
  if me is null then raise exception 'NON_CONNECTE'; end if;
  if p_guest is null or p_guest = me or not exists (select 1 from players where id = p_guest) then raise exception 'JOUEUR_INTROUVABLE'; end if;
  if p_pairs not in (6, 8, 10, 15, 18) then raise exception 'MM_GRILLE'; end if;
  select * into g from mm_games
    where status in ('invite','play') and ((host = me and guest = p_guest) or (host = p_guest and guest = me))
    order by created_at desc limit 1;
  if found then return mm_view(g); end if;
  select jsonb_agg(c order by random()) into ids from (
    select x.id as c from (select id from bm_cards order by random() limit p_pairs) x, generate_series(1, 2)) y;
  if ids is null or jsonb_array_length(ids) < p_pairs * 2 then raise exception 'CATALOGUE_VIDE'; end if;
  insert into mm_games(host, guest, pairs, layout, last_event) values (me, p_guest, p_pairs, ids, jsonb_build_object('type','invite'))
    returning * into g;
  return mm_view(g);
end $$;

create or replace function public.mm_respond(p_game uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.mm_games;
begin
  select * into g from mm_games where id = p_game for update;
  if not found then raise exception 'MM_INTROUVABLE'; end if;
  if mm_role(g) <> 'guest' then raise exception 'NON_AUTORISE'; end if;
  if g.status <> 'invite' then raise exception 'MM_DEJA_TRAITEE'; end if;
  update mm_games set status = case when p_accept then 'play' else 'declined' end, updated_at = now(),
    last_event = jsonb_build_object('type', case when p_accept then 'start' else 'declined' end)
    where id = p_game returning * into g;
  return mm_view(g);
end $$;

create or replace function public.mm_quit(p_game uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.mm_games; r text;
begin
  select * into g from mm_games where id = p_game for update;
  if not found then raise exception 'MM_INTROUVABLE'; end if;
  r := mm_role(g);
  if g.status = 'invite' then
    update mm_games set status = case when r = 'host' then 'cancelled' else 'declined' end, updated_at = now() where id = p_game returning * into g;
  elsif g.status = 'play' then
    update mm_games set status = 'done', winner = case when r = 'host' then 'guest' else 'host' end, updated_at = now(),
      last_event = jsonb_build_object('type','abandon','by', r) where id = p_game returning * into g;
  end if;
  return mm_view(g);
end $$;

-- Retourner une carte. 2e carte : paire trouvée = on rejoue, sinon la main passe.
create or replace function public.mm_flip(p_game uuid, p_index int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.mm_games; r text; n int; i int; ok boolean;
begin
  select * into g from mm_games where id = p_game for update;
  if not found then raise exception 'MM_INTROUVABLE'; end if;
  r := mm_role(g);
  if g.status <> 'play' or g.turn <> r then raise exception 'MM_PAS_TON_TOUR'; end if;
  n := jsonb_array_length(g.layout);
  if p_index is null or p_index < 0 or p_index >= n or g.matched ? p_index::text or g.pending = p_index then raise exception 'MM_CARTE_INVALIDE'; end if;
  g.seq := g.seq + 1;
  if g.pending is null then
    g.pending := p_index;
  else
    i := g.pending;
    ok := (g.layout->>i) = (g.layout->>p_index);
    g.last_pair := jsonb_build_object('i', i, 'j', p_index, 'ci', g.layout->>i, 'cj', g.layout->>p_index, 'match', ok, 'by', r, 'seq', g.seq);
    g.pending := null;
    if ok then
      g.matched := g.matched || jsonb_build_object(i::text, r, p_index::text, r);
      if r = 'host' then g.host_score := g.host_score + 1; else g.guest_score := g.guest_score + 1; end if;
      if g.host_score + g.guest_score >= g.pairs then
        g.status := 'done';
        g.winner := case when g.host_score > g.guest_score then 'host' when g.guest_score > g.host_score then 'guest' else 'tie' end;
      end if;
    else
      g.turn := case when r = 'host' then 'guest' else 'host' end;
    end if;
  end if;
  update mm_games set seq = g.seq, pending = g.pending, last_pair = g.last_pair, matched = g.matched, host_score = g.host_score,
    guest_score = g.guest_score, status = g.status, winner = g.winner, turn = g.turn, updated_at = now()
    where id = p_game returning * into g;
  return mm_view(g);
end $$;

create or replace function public.mm_state(p_game uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.mm_games;
begin
  select * into g from mm_games where id = p_game;
  if not found then raise exception 'MM_INTROUVABLE'; end if;
  return mm_view(g);
end $$;

create or replace function public.mm_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := bm_me();
begin
  if me is null then raise exception 'NON_CONNECTE'; end if;
  return coalesce((select jsonb_agg(mm_view(g) order by g.updated_at desc) from (
      (select * from mm_games where (host = me or guest = me) and status in ('invite','play'))
      union all
      (select * from mm_games where (host = me or guest = me) and status in ('done','declined','cancelled')
         order by updated_at desc limit 10)) g), '[]'::jsonb);
end $$;

revoke all on function public.mm_role(public.mm_games), public.mm_view(public.mm_games) from public, anon, authenticated;
revoke all on function public.mm_invite(uuid, int), public.mm_respond(uuid, boolean), public.mm_quit(uuid), public.mm_flip(uuid, int),
  public.mm_state(uuid), public.mm_list() from public, anon;
grant execute on function public.mm_invite(uuid, int), public.mm_respond(uuid, boolean), public.mm_quit(uuid), public.mm_flip(uuid, int),
  public.mm_state(uuid), public.mm_list() to authenticated;

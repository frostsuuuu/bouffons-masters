-- =========================================================
--  BOUFFONS MASTERS — SERVEUR (Supabase)
--  À coller UNE FOIS dans Supabase > SQL Editor > New query > Run.
--  On peut le relancer sans risque (il ne supprime pas les données).
-- =========================================================

-- ---------- Joueurs ----------
create table if not exists public.players (
  id          uuid primary key references auth.users (id) on delete cascade,
  pseudo      text not null,
  collection  jsonb not null default '{}'::jsonb,   -- { idCarte: { "1": nb, "2": nb } }
  vitrine     jsonb not null default '[]'::jsonb,   -- [ idCarte, ... ] (4 max)
  stats       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint pseudo_format check (char_length(pseudo) between 3 and 16)
);
create unique index if not exists players_pseudo_unique on public.players (lower(pseudo));

-- ---------- Amis (liste personnelle : j'ajoute qui je veux) ----------
create table if not exists public.friendships (
  user_id     uuid not null references public.players (id) on delete cascade,
  friend_id   uuid not null references public.players (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint not_self check (user_id <> friend_id)
);

-- ---------- Échanges ----------
create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references public.players (id) on delete cascade,
  to_id       uuid not null references public.players (id) on delete cascade,
  offer       jsonb not null default '[]'::jsonb,   -- [ {card, level}, ... ] ce que "from" donne
  request     jsonb not null default '[]'::jsonb,   -- [ {card, level}, ... ] ce que "from" demande
  status      text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint not_self_trade check (from_id <> to_id)
);
create index if not exists trades_to_idx on public.trades (to_id, status);
create index if not exists trades_from_idx on public.trades (from_id, status);

-- =========================================================
--  SÉCURITÉ : chacun lit les profils, mais ne modifie que les siens.
--  Les collections ne changent QUE par les fonctions ci-dessous.
-- =========================================================
alter table public.players     enable row level security;
alter table public.friendships enable row level security;
alter table public.trades      enable row level security;

revoke all on public.players, public.friendships, public.trades from anon, authenticated;
grant select on public.players to authenticated;
grant update (vitrine, stats) on public.players to authenticated;   -- pas le pseudo, pas la collection
grant select, insert, delete on public.friendships to authenticated;
grant select, insert on public.trades to authenticated;

drop policy if exists players_read on public.players;
create policy players_read on public.players for select to authenticated using (true);
drop policy if exists players_update_self on public.players;
create policy players_update_self on public.players for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists friends_read on public.friendships;
create policy friends_read on public.friendships for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());
drop policy if exists friends_insert on public.friendships;
create policy friends_insert on public.friendships for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists friends_delete on public.friendships;
create policy friends_delete on public.friendships for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists trades_read on public.trades;
create policy trades_read on public.trades for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());
drop policy if exists trades_insert on public.trades;
create policy trades_insert on public.trades for insert to authenticated
  with check (from_id = auth.uid() and status = 'pending');

-- =========================================================
--  FONCTIONS
-- =========================================================

-- Ajoute (n > 0) ou retire (n < 0) des exemplaires d'une carte à un niveau.
create or replace function public.bm_coll_add(c jsonb, card text, lvl text, n int)
returns jsonb language plpgsql immutable as $$
declare cur int; lv jsonb;
begin
  if card is null or card !~ '^[A-Za-z0-9_.\-]{1,64}$' then raise exception 'Carte invalide'; end if;
  if lvl is null or lvl !~ '^[1-9]$' then raise exception 'Niveau invalide'; end if;
  cur := coalesce((c #>> array[card, lvl])::int, 0) + n;
  if cur < 0 then raise exception 'CARTE_MANQUANTE:%:%', card, lvl; end if;
  lv := coalesce(c -> card, '{}'::jsonb);
  if cur = 0 then lv := lv - lvl; else lv := jsonb_set(lv, array[lvl], to_jsonb(cur)); end if;
  if lv = '{}'::jsonb then return c - card; end if;
  return jsonb_set(c, array[card], lv);
end $$;

-- Création du compte (pseudo définitif)
create or replace function public.create_player(p_pseudo text)
returns public.players language plpgsql security definer set search_path = public as $$
declare p public.players; clean text;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  select * into p from players where id = auth.uid();
  if found then return p; end if;   -- déjà créé : on ne change rien
  clean := regexp_replace(btrim(coalesce(p_pseudo, '')), '\s+', ' ', 'g');
  if char_length(clean) < 3 or char_length(clean) > 16 then raise exception 'PSEUDO_LONGUEUR'; end if;
  if clean !~ '^[[:alnum:] _.\-]+$' then raise exception 'PSEUDO_CARACTERES'; end if;
  if exists (select 1 from players where lower(pseudo) = lower(clean)) then raise exception 'PSEUDO_PRIS'; end if;
  insert into players (id, pseudo) values (auth.uid(), clean) returning * into p;
  return p;
exception when unique_violation then raise exception 'PSEUDO_PRIS';
end $$;

-- Cartes tirées d'un booster : items = [ {card, level}, ... ] (10 max par appel)
create or replace function public.add_cards(items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; it jsonb;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 10 then raise exception 'Trop de cartes'; end if;
  select collection into c from players where id = auth.uid() for update;
  if not found then raise exception 'PAS_DE_COMPTE'; end if;
  for it in select value from jsonb_array_elements(items) loop
    c := bm_coll_add(c, it->>'card', coalesce(it->>'level', '1'), 1);
  end loop;
  update players set collection = c, updated_at = now() where id = auth.uid();
  return c;
end $$;

-- Fusion : 2 exemplaires au niveau L → 1 exemplaire au niveau L+1 (5 = 4 étoiles max)
create or replace function public.fuse_card(p_card text, p_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if p_level < 1 or p_level >= 5 then raise exception 'Niveau max atteint'; end if;
  select collection into c from players where id = auth.uid() for update;
  c := bm_coll_add(c, p_card, p_level::text, -2);
  c := bm_coll_add(c, p_card, (p_level + 1)::text, 1);
  update players set collection = c, updated_at = now() where id = auth.uid();
  return c;
end $$;

-- Proposer un échange (vérifie que chacun possède bien les cartes)
create or replace function public.propose_trade(p_to uuid, p_offer jsonb, p_request jsonb)
returns public.trades language plpgsql security definer set search_path = public as $$
declare a jsonb; b jsonb; it jsonb; t public.trades;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if p_to = auth.uid() then raise exception 'Pas avec toi-même'; end if;
  if jsonb_array_length(p_offer) + jsonb_array_length(p_request) = 0 then raise exception 'ECHANGE_VIDE'; end if;
  if jsonb_array_length(p_offer) > 20 or jsonb_array_length(p_request) > 20 then raise exception 'Trop de cartes'; end if;
  select collection into a from players where id = auth.uid();
  select collection into b from players where id = p_to;
  if b is null then raise exception 'JOUEUR_INTROUVABLE'; end if;
  for it in select value from jsonb_array_elements(p_offer) loop a := bm_coll_add(a, it->>'card', it->>'level', -1); end loop;
  for it in select value from jsonb_array_elements(p_request) loop b := bm_coll_add(b, it->>'card', it->>'level', -1); end loop;
  insert into trades (from_id, to_id, offer, request) values (auth.uid(), p_to, p_offer, p_request) returning * into t;
  return t;
end $$;

-- Accepter : échange les cartes des deux joueurs d'un seul coup
create or replace function public.accept_trade(p_trade uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.trades; a jsonb; b jsonb; it jsonb;
begin
  select * into t from trades where id = p_trade for update;
  if not found or t.status <> 'pending' then raise exception 'ECHANGE_TERMINE'; end if;
  if t.to_id <> auth.uid() then raise exception 'NON_AUTORISE'; end if;
  perform 1 from players where id in (t.from_id, t.to_id) order by id for update;
  select collection into a from players where id = t.from_id;
  select collection into b from players where id = t.to_id;
  for it in select value from jsonb_array_elements(t.offer) loop
    a := bm_coll_add(a, it->>'card', it->>'level', -1);
    b := bm_coll_add(b, it->>'card', it->>'level', 1);
  end loop;
  for it in select value from jsonb_array_elements(t.request) loop
    b := bm_coll_add(b, it->>'card', it->>'level', -1);
    a := bm_coll_add(a, it->>'card', it->>'level', 1);
  end loop;
  update players set collection = a, updated_at = now() where id = t.from_id;
  update players set collection = b, updated_at = now() where id = t.to_id;
  update trades set status = 'accepted', updated_at = now() where id = p_trade;
  return b;
end $$;

-- Refuser (destinataire) ou annuler (auteur)
create or replace function public.close_trade(p_trade uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.trades;
begin
  select * into t from trades where id = p_trade for update;
  if not found or t.status <> 'pending' then raise exception 'ECHANGE_TERMINE'; end if;
  if t.to_id = auth.uid() then
    update trades set status = 'declined', updated_at = now() where id = p_trade;
  elsif t.from_id = auth.uid() then
    update trades set status = 'cancelled', updated_at = now() where id = p_trade;
  else
    raise exception 'NON_AUTORISE';
  end if;
end $$;

revoke all on function public.bm_coll_add(jsonb, text, text, int) from public, anon, authenticated;
revoke all on function public.create_player(text), public.add_cards(jsonb), public.fuse_card(text, int),
  public.propose_trade(uuid, jsonb, jsonb), public.accept_trade(uuid), public.close_trade(uuid) from public, anon;
grant execute on function public.create_player(text), public.add_cards(jsonb), public.fuse_card(text, int),
  public.propose_trade(uuid, jsonb, jsonb), public.accept_trade(uuid), public.close_trade(uuid) to authenticated;

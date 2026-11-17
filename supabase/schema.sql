-- =========================================================
--  BOUFFONS MASTERS — SERVEUR (Supabase)
--  À coller dans Supabase > SQL Editor > New query > Run.
--  On peut le relancer sans risque : il ne supprime aucune donnée
--  et met à jour une base existante (migration incluse).
--
--  Comptes : pseudo + mot de passe (sans e-mail).
--  Chaque navigateur a une session anonyme Supabase ; la table
--  player_devices relie cette session au compte du joueur après
--  création du compte ou connexion avec pseudo + mot de passe.
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Joueurs ----------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  pseudo      text not null,
  collection  jsonb not null default '{}'::jsonb,   -- { idCarte: { "1": nb, "2": nb } }
  vitrine     jsonb not null default '[]'::jsonb,   -- [ idCarte, ... ] (4 max)
  stats       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint pseudo_format check (char_length(pseudo) between 3 and 16)
);
create unique index if not exists players_pseudo_unique on public.players (lower(pseudo));
-- Migration : avant, l'id du joueur était celui de sa session anonyme.
alter table public.players drop constraint if exists players_id_fkey;
alter table public.players alter column id set default gen_random_uuid();

-- ---------- Appareils / navigateurs connectés à un compte ----------
create table if not exists public.player_devices (
  auth_id     uuid primary key references auth.users (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists player_devices_player_idx on public.player_devices (player_id);
-- Migration : les comptes déjà créés restent connectés sur leur navigateur d'origine.
insert into public.player_devices (auth_id, player_id)
  select p.id, p.id from public.players p join auth.users u on u.id = p.id
  on conflict (auth_id) do nothing;

-- ---------- Mots de passe (chiffrés, illisibles par les joueurs) ----------
create table if not exists public.player_secrets (
  player_id   uuid primary key references public.players (id) on delete cascade,
  pw_hash     text not null,
  updated_at  timestamptz not null default now()
);

-- ---------- Anti-devinette de mot de passe ----------
create table if not exists public.login_attempts (
  pseudo_key  text not null,
  at          timestamptz not null default now()
);
create index if not exists login_attempts_idx on public.login_attempts (pseudo_key, at);

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
--  QUI SUIS-JE ? (le joueur relié à la session de ce navigateur)
-- =========================================================
create or replace function public.bm_me()
returns uuid language sql stable security definer set search_path = public as $$
  select player_id from player_devices where auth_id = auth.uid()
$$;

-- =========================================================
--  SÉCURITÉ : chacun lit les profils, mais ne modifie que les siens.
--  Les collections ne changent QUE par les fonctions ci-dessous.
-- =========================================================
alter table public.players        enable row level security;
alter table public.player_devices enable row level security;
alter table public.player_secrets enable row level security;
alter table public.login_attempts enable row level security;
alter table public.friendships    enable row level security;
alter table public.trades         enable row level security;

revoke all on public.players, public.player_devices, public.player_secrets, public.login_attempts,
  public.friendships, public.trades from anon, authenticated;
grant select on public.players to authenticated;
grant update (vitrine, stats) on public.players to authenticated;   -- pas le pseudo, pas la collection
grant select, insert, delete on public.friendships to authenticated;
grant select, insert on public.trades to authenticated;
-- player_devices, player_secrets, login_attempts : aucun accès direct.

drop policy if exists players_read on public.players;
create policy players_read on public.players for select to authenticated using (true);
drop policy if exists players_update_self on public.players;
create policy players_update_self on public.players for update to authenticated
  using (id = public.bm_me()) with check (id = public.bm_me());

drop policy if exists friends_read on public.friendships;
create policy friends_read on public.friendships for select to authenticated
  using (user_id = public.bm_me() or friend_id = public.bm_me());
drop policy if exists friends_insert on public.friendships;
create policy friends_insert on public.friendships for insert to authenticated
  with check (user_id = public.bm_me());
drop policy if exists friends_delete on public.friendships;
create policy friends_delete on public.friendships for delete to authenticated
  using (user_id = public.bm_me());

drop policy if exists trades_read on public.trades;
create policy trades_read on public.trades for select to authenticated
  using (from_id = public.bm_me() or to_id = public.bm_me());
drop policy if exists trades_insert on public.trades;
create policy trades_insert on public.trades for insert to authenticated
  with check (from_id = public.bm_me() and status = 'pending');

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

-- Mon compte (null si ce navigateur n'est connecté à aucun compte)
create or replace function public.my_player()
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object('has_password', exists (select 1 from player_secrets s where s.player_id = p.id))
  from players p where p.id = bm_me()
$$;

-- Ancienne version (sans mot de passe) : supprimée.
drop function if exists public.create_player(text);

-- Création du compte : pseudo (définitif) + mot de passe
create or replace function public.create_player(p_pseudo text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare clean text; new_id uuid;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if bm_me() is not null then return my_player(); end if;   -- déjà un compte sur ce navigateur
  clean := regexp_replace(btrim(coalesce(p_pseudo, '')), '\s+', ' ', 'g');
  if char_length(clean) < 3 or char_length(clean) > 16 then raise exception 'PSEUDO_LONGUEUR'; end if;
  if clean !~ '^[[:alnum:] _.\-]+$' then raise exception 'PSEUDO_CARACTERES'; end if;
  if char_length(coalesce(p_password, '')) < 6 or char_length(p_password) > 72 then raise exception 'MDP_LONGUEUR'; end if;
  if exists (select 1 from players where lower(pseudo) = lower(clean)) then raise exception 'PSEUDO_PRIS'; end if;
  insert into players (pseudo) values (clean) returning id into new_id;
  insert into player_secrets (player_id, pw_hash) values (new_id, crypt(p_password, gen_salt('bf', 8)));
  insert into player_devices (auth_id, player_id) values (auth.uid(), new_id)
    on conflict (auth_id) do update set player_id = excluded.player_id;
  return my_player();
exception when unique_violation then raise exception 'PSEUDO_PRIS';
end $$;

-- Connexion sur un autre navigateur / appareil
create or replace function public.login_player(p_pseudo text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text; p public.players; h text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'NON_CONNECTE'); end if;
  k := lower(regexp_replace(btrim(coalesce(p_pseudo, '')), '\s+', ' ', 'g'));
  delete from login_attempts where at < now() - interval '1 day';
  if (select count(*) from login_attempts where pseudo_key = k and at > now() - interval '15 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'TROP_DE_TENTATIVES');
  end if;
  select * into p from players where lower(pseudo) = k;
  if found then select pw_hash into h from player_secrets where player_id = p.id; end if;
  if p.id is null or h is null or crypt(coalesce(p_password, ''), h) <> h then
    insert into login_attempts (pseudo_key) values (k);
    return jsonb_build_object('ok', false, 'error', 'IDENTIFIANTS');
  end if;
  delete from login_attempts where pseudo_key = k;
  insert into player_devices (auth_id, player_id) values (auth.uid(), p.id)
    on conflict (auth_id) do update set player_id = excluded.player_id;
  return jsonb_build_object('ok', true, 'player', my_player());
end $$;

-- Choisir / changer son mot de passe
create or replace function public.set_password(p_new text, p_old text default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare me uuid; h text;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  if char_length(coalesce(p_new, '')) < 6 or char_length(p_new) > 72 then raise exception 'MDP_LONGUEUR'; end if;
  select pw_hash into h from player_secrets where player_id = me;
  if h is not null and (p_old is null or crypt(p_old, h) <> h) then raise exception 'MDP_ACTUEL'; end if;
  insert into player_secrets (player_id, pw_hash) values (me, crypt(p_new, gen_salt('bf', 8)))
    on conflict (player_id) do update set pw_hash = excluded.pw_hash, updated_at = now();
  return true;
end $$;

-- Se déconnecter de ce navigateur
create or replace function public.logout_device()
returns void language sql security definer set search_path = public as $$
  delete from player_devices where auth_id = auth.uid()
$$;

-- Fusion : 2 exemplaires au niveau L → 1 exemplaire au niveau L+1
-- (niveau 1 = sans étoile, 2 à 4 = ★ à ★★★ dorées, 5 à 7 = ★ à ★★★ arc-en-ciel ; 7 = max)
create or replace function public.fuse_card(p_card text, p_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; me uuid;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  if p_level < 1 or p_level >= 7 then raise exception 'Niveau max atteint'; end if;
  select collection into c from players where id = me for update;
  c := bm_coll_add(c, p_card, p_level::text, -2);
  c := bm_coll_add(c, p_card, (p_level + 1)::text, 1);
  update players set collection = c, updated_at = now() where id = me;
  return c;
end $$;

-- Proposer un échange (vérifie que chacun possède bien les cartes)
create or replace function public.propose_trade(p_to uuid, p_offer jsonb, p_request jsonb)
returns public.trades language plpgsql security definer set search_path = public as $$
declare a jsonb; b jsonb; it jsonb; t public.trades; me uuid;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  if p_to = me then raise exception 'Pas avec toi-même'; end if;
  if jsonb_array_length(p_offer) + jsonb_array_length(p_request) = 0 then raise exception 'ECHANGE_VIDE'; end if;
  if jsonb_array_length(p_offer) > 20 or jsonb_array_length(p_request) > 20 then raise exception 'Trop de cartes'; end if;
  select collection into a from players where id = me;
  select collection into b from players where id = p_to;
  if b is null then raise exception 'JOUEUR_INTROUVABLE'; end if;
  for it in select value from jsonb_array_elements(p_offer) loop a := bm_coll_add(a, it->>'card', it->>'level', -1); end loop;
  for it in select value from jsonb_array_elements(p_request) loop b := bm_coll_add(b, it->>'card', it->>'level', -1); end loop;
  insert into trades (from_id, to_id, offer, request) values (me, p_to, p_offer, p_request) returning * into t;
  return t;
end $$;

-- Accepter : échange les cartes des deux joueurs d'un seul coup
create or replace function public.accept_trade(p_trade uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.trades; a jsonb; b jsonb; it jsonb;
begin
  select * into t from trades where id = p_trade for update;
  if not found or t.status <> 'pending' then raise exception 'ECHANGE_TERMINE'; end if;
  if t.to_id is distinct from bm_me() then raise exception 'NON_AUTORISE'; end if;
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
declare t public.trades; me uuid;
begin
  me := bm_me();
  select * into t from trades where id = p_trade for update;
  if not found or t.status <> 'pending' then raise exception 'ECHANGE_TERMINE'; end if;
  if t.to_id = me then
    update trades set status = 'declined', updated_at = now() where id = p_trade;
  elsif t.from_id = me then
    update trades set status = 'cancelled', updated_at = now() where id = p_trade;
  else
    raise exception 'NON_AUTORISE';
  end if;
end $$;

-- ---------- Droits sur les fonctions ----------
revoke all on function public.bm_coll_add(jsonb, text, text, int) from public, anon, authenticated;
revoke all on function public.bm_me(), public.my_player(), public.create_player(text, text),
  public.login_player(text, text), public.set_password(text, text), public.logout_device(),
  public.fuse_card(text, int), public.propose_trade(uuid, jsonb, jsonb),
  public.accept_trade(uuid), public.close_trade(uuid) from public, anon;
grant execute on function public.bm_me(), public.my_player(), public.create_player(text, text),
  public.login_player(text, text), public.set_password(text, text), public.logout_device(),
  public.fuse_card(text, int), public.propose_trade(uuid, jsonb, jsonb),
  public.accept_trade(uuid), public.close_trade(uuid) to authenticated;

-- ---------- Liste d'amis d'un joueur (visible par tous les joueurs) ----------
create or replace function public.player_friends(p_player uuid)
returns table (id uuid, pseudo text, collection jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.pseudo, p.collection
  from public.friendships f join public.players p on p.id = f.friend_id
  where f.user_id = p_player and public.bm_me() is not null
  order by lower(p.pseudo);
$$;
revoke all on function public.player_friends(uuid) from public, anon;
grant execute on function public.player_friends(uuid) to authenticated;

-- =========================================================
--  ANTI-TRICHE : les boosters sont tirés par le serveur
--  - le catalogue des cartes (id + rareté) et les réglages des boosters
--    sont copiés ici automatiquement depuis cards.js / config.js
--    quand un ADMIN (Frosty, BatZizi) ouvre le jeu ;
--  - le stock de boosters de chaque joueur est compté par le serveur ;
--  - plus aucun moyen de s'ajouter des cartes à la main.
-- =========================================================
create table if not exists public.bm_cards (
  id     text primary key,
  rarete text not null
);
create table if not exists public.bm_settings (
  id                 int primary key default 1 check (id = 1),
  cards_per_booster  int not null default 5,
  recharge_minutes   numeric not null default 1,
  boosters_max       int,                       -- null = illimité
  boosters_start     int not null default 5,
  guarantee          text,                      -- rareté minimale de la dernière carte (null = aucune)
  rarities           jsonb not null default '[]'::jsonb,  -- [{id, poids}] de la plus commune à la plus rare
  test_mode          boolean not null default false
);
alter table public.bm_cards enable row level security;
alter table public.bm_settings enable row level security;
revoke all on public.bm_cards, public.bm_settings from public, anon, authenticated;

alter table public.players add column if not exists is_admin boolean not null default false;
alter table public.players add column if not exists bstock int;
alter table public.players add column if not exists blast timestamptz;

-- Valeurs de départ (identiques à cards.js / config.js au moment de l'installation)
insert into public.bm_settings (id, cards_per_booster, recharge_minutes, boosters_max, boosters_start, guarantee, rarities, test_mode)
select 1, (s->>'cards_per_booster')::int, (s->>'recharge_minutes')::numeric, (s->>'boosters_max')::int,
       (s->>'boosters_start')::int, s->>'guarantee', s->'rarities', coalesce((s->>'test_mode')::boolean, false)
from (select '{"cards_per_booster":5,"recharge_minutes":1,"boosters_max":null,"boosters_start":5,"guarantee":"rare","rarities":[{"id":"commune","poids":70},{"id":"rare","poids":22},{"id":"epique","poids":6},{"id":"legendaire","poids":2}],"test_mode":false}'::jsonb s) x
on conflict (id) do nothing;
insert into public.bm_cards (id, rarete)
select e->>'id', e->>'rarete' from jsonb_array_elements('[{"id":"pote-en-retard","rarete":"commune"},{"id":"roi-du-canape","rarete":"commune"},{"id":"accro-au-kebab","rarete":"commune"},{"id":"admin-whatsapp","rarete":"commune"},{"id":"blagues-nulles","rarete":"rare"},{"id":"dj-autoproclame","rarete":"commune"},{"id":"chef-des-pates","rarete":"rare"},{"id":"organisateur","rarete":"rare"},{"id":"photographe","rarete":"epique"},{"id":"roi-des-bouffons","rarete":"legendaire"}]'::jsonb) e
on conflict (id) do nothing;

-- Admins : les deux créateurs du jeu
update public.players set is_admin = true where lower(pseudo) in ('frosty', 'batzizi');

-- Stock de départ des joueurs déjà inscrits : ce que la recharge leur a donné depuis
-- la création du compte, moins les boosters déjà ouverts.
update public.players p set
  bstock = greatest(0, s.boosters_start
                        + floor(extract(epoch from now() - p.created_at) / (s.recharge_minutes * 60))::int
                        - coalesce((p.stats->>'boosters')::int, 0)),
  blast  = now()
from public.bm_settings s
where p.bstock is null and s.id = 1;
update public.players p set bstock = least(p.bstock, s.boosters_max)
from public.bm_settings s where s.id = 1 and s.boosters_max is not null and p.bstock > s.boosters_max;

-- Nouveaux joueurs : stock de départ
create or replace function public.bm_player_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.bstock is null then
    select coalesce(boosters_max, boosters_start) into new.bstock from bm_settings where id = 1;
    new.bstock := coalesce(new.bstock, 5);
    new.blast := now();
  end if;
  new.is_admin := false; -- personne ne devient admin en créant son compte
  return new;
end $$;
drop trigger if exists players_defaults on public.players;
create trigger players_defaults before insert on public.players
  for each row execute function public.bm_player_defaults();

-- Recharge (même calcul que dans le jeu) : renvoie le stock à jour
create or replace function public.bm_refill(p_id uuid)
returns players language plpgsql security definer set search_path = public as $$
declare p players; s bm_settings; iv numeric; gained int;
begin
  select * into s from bm_settings where id = 1;
  select * into p from players where id = p_id for update;
  iv := s.recharge_minutes * 60;
  if p.bstock is null then p.bstock := coalesce(s.boosters_max, s.boosters_start); p.blast := now(); end if;
  if s.boosters_max is not null and p.bstock >= s.boosters_max then
    p.bstock := s.boosters_max; p.blast := now();
  else
    gained := floor(extract(epoch from now() - p.blast) / iv);
    if gained > 0 then
      p.bstock := p.bstock + gained;
      if s.boosters_max is not null and p.bstock >= s.boosters_max then
        p.bstock := s.boosters_max; p.blast := now();
      else
        p.blast := p.blast + make_interval(secs => gained * iv);
      end if;
    end if;
  end if;
  update players set bstock = p.bstock, blast = p.blast where id = p_id;
  return p;
end $$;

-- Ouvrir un booster : vérifie le stock, tire les cartes, les ajoute à la collection
create or replace function public.open_booster()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; p players; s bm_settings; n int; i int; pool jsonb; total numeric; x numeric;
        r jsonb; chosen text; cid text; got text[] := '{}'; c jsonb; gidx int;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  select * into s from bm_settings where id = 1;
  if not found or not exists (select 1 from bm_cards) then raise exception 'CATALOGUE_VIDE'; end if;
  p := bm_refill(me);
  if not s.test_mode then
    if p.bstock <= 0 then raise exception 'PLUS_DE_BOOSTER'; end if;
    if s.boosters_max is not null and p.bstock >= s.boosters_max then p.blast := now(); end if;
    p.bstock := p.bstock - 1;
  end if;
  n := greatest(1, least(s.cards_per_booster, 10));
  for i in 1..n loop
    -- raretés qui ont au moins une carte, dans l'ordre (de la plus commune à la plus rare)
    select coalesce(jsonb_agg(e.v order by e.ord), '[]'::jsonb) into pool
    from jsonb_array_elements(s.rarities) with ordinality e(v, ord)
    where exists (select 1 from bm_cards k where k.rarete = e.v->>'id')
      and (i < n or s.guarantee is null
           or e.ord >= coalesce((select o.ord from jsonb_array_elements(s.rarities) with ordinality o(v, ord) where o.v->>'id' = s.guarantee), 0));
    if jsonb_array_length(pool) = 0 then
      select coalesce(jsonb_agg(e.v order by e.ord), '[]'::jsonb) into pool
      from jsonb_array_elements(s.rarities) with ordinality e(v, ord)
      where exists (select 1 from bm_cards k where k.rarete = e.v->>'id');
    end if;
    select sum(greatest((v->>'poids')::numeric, 0)) into total from jsonb_array_elements(pool) v;
    x := random() * coalesce(nullif(total, 0), 1);
    chosen := null;
    for r in select v from jsonb_array_elements(pool) v loop
      x := x - greatest((r->>'poids')::numeric, 0);
      if x < 0 then chosen := r->>'id'; exit; end if;
    end loop;
    if chosen is null then chosen := pool->(jsonb_array_length(pool) - 1)->>'id'; end if;
    select k.id into cid from bm_cards k where k.rarete = chosen order by random() limit 1;
    if cid is null then select k.id into cid from bm_cards k order by random() limit 1; end if;
    got := got || cid;
  end loop;
  -- les plus rares à la fin, pour le suspense
  select array_agg(g.id order by coalesce(o.ord, 0), g.n) into got
  from unnest(got) with ordinality g(id, n)
  join bm_cards k on k.id = g.id
  left join jsonb_array_elements(s.rarities) with ordinality o(v, ord) on o.v->>'id' = k.rarete;
  select collection into c from players where id = me;
  foreach cid in array got loop c := bm_coll_add(c, cid, '1', 1); end loop;
  update players set collection = c, bstock = p.bstock, blast = p.blast, updated_at = now() where id = me;
  return jsonb_build_object('cards', to_jsonb(got), 'collection', c, 'bstock', p.bstock, 'blast', p.blast);
end $$;

-- Stock de boosters à jour (sans en ouvrir)
create or replace function public.booster_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; p players;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  p := bm_refill(me);
  return jsonb_build_object('bstock', p.bstock, 'blast', p.blast);
end $$;

-- Copie du catalogue et des réglages depuis le jeu (admins uniquement)
create or replace function public.sync_catalog(p_cards jsonb, p_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  me := bm_me();
  if me is null or not exists (select 1 from players where id = me and is_admin) then raise exception 'PAS_ADMIN'; end if;
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) = 0 then raise exception 'CATALOGUE_VIDE'; end if;
  delete from bm_cards where id not in (select e->>'id' from jsonb_array_elements(p_cards) e);
  insert into bm_cards (id, rarete) select e->>'id', e->>'rarete' from jsonb_array_elements(p_cards) e
    where coalesce(e->>'id', '') <> '' and coalesce(e->>'rarete', '') <> ''
    on conflict (id) do update set rarete = excluded.rarete;
  insert into bm_settings (id) values (1) on conflict (id) do nothing;
  update bm_settings set
    cards_per_booster = coalesce((p_settings->>'cards_per_booster')::int, cards_per_booster),
    recharge_minutes  = coalesce((p_settings->>'recharge_minutes')::numeric, recharge_minutes),
    boosters_max      = (p_settings->>'boosters_max')::int,
    boosters_start    = coalesce((p_settings->>'boosters_start')::int, boosters_start),
    guarantee         = p_settings->>'guarantee',
    rarities          = coalesce(p_settings->'rarities', rarities),
    test_mode         = coalesce((p_settings->>'test_mode')::boolean, false)
  where id = 1;
end $$;

-- Les colonnes boosters / admin ne sont modifiables que par le serveur
revoke update on public.players from authenticated;
grant update (vitrine, stats) on public.players to authenticated;

-- L'ancienne fonction qui permettait d'ajouter n'importe quelle carte disparaît
drop function if exists public.add_cards(jsonb);

revoke all on function public.bm_refill(uuid), public.bm_player_defaults() from public, anon, authenticated;
revoke all on function public.open_booster(), public.booster_status(), public.sync_catalog(jsonb, jsonb) from public, anon;
grant execute on function public.open_booster(), public.booster_status(), public.sync_catalog(jsonb, jsonb) to authenticated;

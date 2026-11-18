-- =========================================================
--  MINI-JEU « QUI EST-CE ? » (1 contre 1 entre amis)
--  À coller UNE fois dans Supabase > SQL Editor > Run
--  (déjà appliqué sur le projet ; ce fichier sert de référence)
--
--  Toutes les actions passent par les fonctions ci-dessous :
--  personne ne peut lire la carte secrète de l'adversaire.
-- =========================================================

create table if not exists public.qe_games (
  id          uuid primary key default gen_random_uuid(),
  host        uuid not null references public.players(id) on delete cascade,   -- celui qui invite (joueur 1)
  guest       uuid not null references public.players(id) on delete cascade,   -- l'ami invité (joueur 2)
  status      text not null default 'invite'
              check (status in ('invite','choose','play','done','declined','cancelled')),
  cards       jsonb not null,                       -- les 24 cartes (ids), tirées dans la collection de l'hôte
  host_secret text,                                 -- carte choisie par l'hôte
  guest_secret text,                                -- carte choisie par l'invité
  host_down   jsonb not null default '[]'::jsonb,   -- cartes grisées par l'hôte
  guest_down  jsonb not null default '[]'::jsonb,   -- cartes grisées par l'invité
  turn        text check (turn in ('host','guest')),
  bonus       int not null default 0,               -- tours supplémentaires (après un mauvais « deviner » adverse)
  turn_no     int not null default 0,
  winner      uuid references public.players(id) on delete set null,
  last_event  jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists qe_games_host_idx  on public.qe_games(host, updated_at desc);
create index if not exists qe_games_guest_idx on public.qe_games(guest, updated_at desc);
alter table public.qe_games enable row level security;
revoke all on public.qe_games from anon, authenticated;

-- Rôle du joueur connecté dans une partie ('host' / 'guest'), ou erreur
create or replace function public.qe_role(g public.qe_games)
returns text language plpgsql stable security definer set search_path = public as $$
declare me uuid := bm_me();
begin
  if me is null then raise exception 'NON_CONNECTE'; end if;
  if g.host = me then return 'host'; end if;
  if g.guest = me then return 'guest'; end if;
  raise exception 'NON_AUTORISE';
end $$;

-- État d'une partie vu par le joueur connecté (sans la carte secrète adverse tant que la partie n'est pas finie)
create or replace function public.qe_view(g public.qe_games)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r text := qe_role(g); other uuid; opp text;
begin
  other := case when r = 'host' then g.guest else g.host end;
  select pseudo into opp from players where id = other;
  return jsonb_build_object(
    'id', g.id, 'status', g.status, 'role', r, 'cards', g.cards,
    'opponent', jsonb_build_object('id', other, 'pseudo', opp),
    'my_secret',  case when r = 'host' then g.host_secret else g.guest_secret end,
    'opp_chosen', case when r = 'host' then g.guest_secret is not null else g.host_secret is not null end,
    'opp_secret', case when g.status = 'done' then (case when r = 'host' then g.guest_secret else g.host_secret end) end,
    'my_down',  case when r = 'host' then g.host_down else g.guest_down end,
    'opp_down', case when r = 'host' then g.guest_down else g.host_down end,
    'my_turn', g.status = 'play' and g.turn = r,
    'bonus', g.bonus, 'turn_no', g.turn_no,
    'winner', case when g.winner is null then null when g.winner = bm_me() then 'me' else 'opp' end,
    'last_event', g.last_event, 'updated_at', g.updated_at, 'created_at', g.created_at);
end $$;

-- Inviter un ami : 24 cartes au hasard dans MA collection
create or replace function public.qe_invite(p_guest uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := bm_me(); coll jsonb; ids jsonb; g public.qe_games;
begin
  if me is null then raise exception 'NON_CONNECTE'; end if;
  if p_guest is null or p_guest = me or not exists (select 1 from players where id = p_guest) then raise exception 'JOUEUR_INTROUVABLE'; end if;
  -- une seule partie en cours entre deux mêmes joueurs : on la renvoie
  select * into g from qe_games
    where status in ('invite','choose','play') and ((host = me and guest = p_guest) or (host = p_guest and guest = me))
    order by created_at desc limit 1;
  if found then return qe_view(g); end if;
  select collection into coll from players where id = me;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into ids from (
    select k.id from bm_cards k
    where exists (select 1 from jsonb_each_text(coalesce(coll->k.id, '{}'::jsonb)) e where e.value::int > 0)
    order by random() limit 24) x;
  if jsonb_array_length(ids) < 6 then raise exception 'QE_PAS_ASSEZ'; end if;
  insert into qe_games(host, guest, cards, last_event) values (me, p_guest, ids, jsonb_build_object('type','invite'))
    returning * into g;
  return qe_view(g);
end $$;

-- Accepter / refuser une invitation (l'invité)
create or replace function public.qe_respond(p_game uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.qe_games;
begin
  select * into g from qe_games where id = p_game for update;
  if not found then raise exception 'QE_INTROUVABLE'; end if;
  if qe_role(g) <> 'guest' then raise exception 'NON_AUTORISE'; end if;
  if g.status <> 'invite' then raise exception 'QE_DEJA_TRAITEE'; end if;
  update qe_games set status = case when p_accept then 'choose' else 'declined' end, updated_at = now(),
    last_event = jsonb_build_object('type', case when p_accept then 'accepted' else 'declined' end)
    where id = p_game returning * into g;
  return qe_view(g);
end $$;

-- Annuler une invitation (hôte) ou abandonner une partie (l'adversaire gagne)
create or replace function public.qe_quit(p_game uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.qe_games; r text; other uuid;
begin
  select * into g from qe_games where id = p_game for update;
  if not found then raise exception 'QE_INTROUVABLE'; end if;
  r := qe_role(g);
  other := case when r = 'host' then g.guest else g.host end;
  if g.status = 'invite' then
    update qe_games set status = case when r = 'host' then 'cancelled' else 'declined' end, updated_at = now() where id = p_game returning * into g;
  elsif g.status in ('choose','play') then
    update qe_games set status = 'done', winner = other, updated_at = now(),
      last_event = jsonb_build_object('type','abandon','by', r) where id = p_game returning * into g;
  end if;
  return qe_view(g);
end $$;

-- Choisir sa carte secrète (une seule fois). La partie démarre quand les deux ont choisi.
create or replace function public.qe_choose(p_game uuid, p_card text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.qe_games; r text;
begin
  select * into g from qe_games where id = p_game for update;
  if not found then raise exception 'QE_INTROUVABLE'; end if;
  r := qe_role(g);
  if g.status <> 'choose' then raise exception 'QE_MAUVAISE_ETAPE'; end if;
  if not (g.cards ? p_card) then raise exception 'QE_CARTE_INVALIDE'; end if;
  if r = 'host' then
    if g.host_secret is not null then raise exception 'QE_DEJA_CHOISI'; end if;
    g.host_secret := p_card;
  else
    if g.guest_secret is not null then raise exception 'QE_DEJA_CHOISI'; end if;
    g.guest_secret := p_card;
  end if;
  if g.host_secret is not null and g.guest_secret is not null then
    g.status := 'play'; g.turn := 'host'; g.turn_no := 1; g.bonus := 0;
    g.last_event := jsonb_build_object('type','start');
  end if;
  update qe_games set host_secret = g.host_secret, guest_secret = g.guest_secret, status = g.status, turn = g.turn,
    turn_no = g.turn_no, bonus = g.bonus, last_event = g.last_event, updated_at = now()
    where id = p_game returning * into g;
  return qe_view(g);
end $$;

-- Garde uniquement des cartes de la partie, sans doublon
create or replace function public.qe_clean(g public.qe_games, p_down jsonb)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
  from jsonb_array_elements_text(case when jsonb_typeof(p_down) = 'array' then p_down else '[]'::jsonb end) v
  where g.cards ? v
$$;

-- Enregistrer mes cartes grisées pendant mon tour (l'adversaire voit ma progression)
create or replace function public.qe_set_down(p_game uuid, p_down jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.qe_games; r text;
begin
  select * into g from qe_games where id = p_game for update;
  if not found then raise exception 'QE_INTROUVABLE'; end if;
  r := qe_role(g);
  if g.status <> 'play' or g.turn <> r then raise exception 'QE_PAS_TON_TOUR'; end if;
  if r = 'host' then update qe_games set host_down = qe_clean(g, p_down), updated_at = now() where id = p_game returning * into g;
  else update qe_games set guest_down = qe_clean(g, p_down), updated_at = now() where id = p_game returning * into g; end if;
  return qe_view(g);
end $$;

-- Valider mon tour : la main passe à l'adversaire (sauf si j'ai un tour bonus)
create or replace function public.qe_end_turn(p_game uuid, p_down jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.qe_games; r text;
begin
  select * into g from qe_games where id = p_game for update;
  if not found then raise exception 'QE_INTROUVABLE'; end if;
  r := qe_role(g);
  if g.status <> 'play' or g.turn <> r then raise exception 'QE_PAS_TON_TOUR'; end if;
  if r = 'host' then g.host_down := qe_clean(g, p_down); else g.guest_down := qe_clean(g, p_down); end if;
  if g.bonus > 0 then
    g.bonus := g.bonus - 1;
    g.last_event := jsonb_build_object('type','bonus_turn','by', r);
  else
    g.turn := case when r = 'host' then 'guest' else 'host' end;
    g.last_event := jsonb_build_object('type','turn','by', r);
  end if;
  g.turn_no := g.turn_no + 1;
  update qe_games set host_down = g.host_down, guest_down = g.guest_down, turn = g.turn, bonus = g.bonus,
    turn_no = g.turn_no, last_event = g.last_event, updated_at = now() where id = p_game returning * into g;
  return qe_view(g);
end $$;

-- Deviner la carte adverse. Juste : victoire. Faux : l'adversaire joue 2 tours d'affilée.
create or replace function public.qe_guess(p_game uuid, p_card text, p_down jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.qe_games; r text; target text; ok boolean;
begin
  select * into g from qe_games where id = p_game for update;
  if not found then raise exception 'QE_INTROUVABLE'; end if;
  r := qe_role(g);
  if g.status <> 'play' or g.turn <> r then raise exception 'QE_PAS_TON_TOUR'; end if;
  if not (g.cards ? p_card) then raise exception 'QE_CARTE_INVALIDE'; end if;
  if p_down is not null then
    if r = 'host' then g.host_down := qe_clean(g, p_down); else g.guest_down := qe_clean(g, p_down); end if;
  end if;
  target := case when r = 'host' then g.guest_secret else g.host_secret end;
  ok := (p_card = target);
  if ok then
    g.status := 'done'; g.winner := bm_me();
  else
    g.turn := case when r = 'host' then 'guest' else 'host' end;
    g.bonus := 1;
    g.turn_no := g.turn_no + 1;
  end if;
  g.last_event := jsonb_build_object('type','guess','by', r, 'card', p_card, 'ok', ok);
  update qe_games set status = g.status, winner = g.winner, turn = g.turn, bonus = g.bonus, turn_no = g.turn_no,
    host_down = g.host_down, guest_down = g.guest_down, last_event = g.last_event, updated_at = now()
    where id = p_game returning * into g;
  return qe_view(g);
end $$;

-- Lire une partie
create or replace function public.qe_state(p_game uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.qe_games;
begin
  select * into g from qe_games where id = p_game;
  if not found then raise exception 'QE_INTROUVABLE'; end if;
  return qe_view(g);
end $$;

-- Mes parties : en cours + les 10 dernières terminées
create or replace function public.qe_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := bm_me();
begin
  if me is null then raise exception 'NON_CONNECTE'; end if;
  return coalesce((select jsonb_agg(qe_view(g) order by g.updated_at desc) from (
      (select * from qe_games where (host = me or guest = me) and status in ('invite','choose','play'))
      union all
      (select * from qe_games where (host = me or guest = me) and status in ('done','declined','cancelled')
         order by updated_at desc limit 10)) g), '[]'::jsonb);
end $$;

revoke all on function public.qe_role(public.qe_games), public.qe_view(public.qe_games), public.qe_clean(public.qe_games, jsonb)
  from public, anon, authenticated;
revoke all on function public.qe_invite(uuid), public.qe_respond(uuid, boolean), public.qe_quit(uuid), public.qe_choose(uuid, text),
  public.qe_set_down(uuid, jsonb), public.qe_end_turn(uuid, jsonb), public.qe_guess(uuid, text, jsonb), public.qe_state(uuid), public.qe_list()
  from public, anon;
grant execute on function public.qe_invite(uuid), public.qe_respond(uuid, boolean), public.qe_quit(uuid), public.qe_choose(uuid, text),
  public.qe_set_down(uuid, jsonb), public.qe_end_turn(uuid, jsonb), public.qe_guess(uuid, text, jsonb), public.qe_state(uuid), public.qe_list()
  to authenticated;

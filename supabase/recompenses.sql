-- =========================================================
-- PACKS RÉCOMPENSE (mini-jeux) + MEMORY SOLO côté serveur
-- - players.reward_packs : liste des packs gagnés pas encore ouverts [{n, src, at}]
-- - Pack récompense : comme un booster normal, mais toutes les raretés
--   au-dessus de Commune ont 25 % de chances en plus (poids × 1,25).
-- - Victoire en 1 contre 1 (Memory ou Qui est-ce ?, pas par abandon) : pack de 5 cartes.
-- - Memory solo : la grille reste sur le serveur. À la fin de la série,
--   « M'arrêter » après un niveau réussi : pack de (niveaux réussis + 2) cartes.
--   Perdre (plus de coups) ou quitter en plein niveau : rien.
-- =========================================================

alter table public.players add column if not exists reward_packs jsonb not null default '[]'::jsonb;

-- Tirage de p_n cartes (même règles que open_booster), avec un bonus de chance p_boost
create or replace function public.bm_draw(p_n int, p_boost numeric)
returns text[] language plpgsql security definer set search_path = public as $$
declare s bm_settings; i int; pool jsonb; total numeric; x numeric; r jsonb; chosen text; cid text; got text[] := '{}';
begin
  select * into s from bm_settings where id = 1;
  if not found or not exists (select 1 from bm_cards) then raise exception 'CATALOGUE_VIDE'; end if;
  for i in 1..p_n loop
    -- raretés qui ont au moins une carte ; ord = 1 pour la plus commune
    select coalesce(jsonb_agg(e.v || jsonb_build_object('w', greatest((e.v->>'poids')::numeric, 0) * case when e.ord > 1 then p_boost else 1 end) order by e.ord), '[]'::jsonb) into pool
    from jsonb_array_elements(s.rarities) with ordinality e(v, ord)
    where exists (select 1 from bm_cards k where k.rarete = e.v->>'id')
      and (i < p_n or s.guarantee is null
           or e.ord >= coalesce((select o.ord from jsonb_array_elements(s.rarities) with ordinality o(v, ord) where o.v->>'id' = s.guarantee), 0));
    if jsonb_array_length(pool) = 0 then
      select coalesce(jsonb_agg(e.v || jsonb_build_object('w', greatest((e.v->>'poids')::numeric, 0)) order by e.ord), '[]'::jsonb) into pool
      from jsonb_array_elements(s.rarities) with ordinality e(v, ord)
      where exists (select 1 from bm_cards k where k.rarete = e.v->>'id');
    end if;
    select sum((v->>'w')::numeric) into total from jsonb_array_elements(pool) v;
    x := random() * coalesce(nullif(total, 0), 1);
    chosen := null;
    for r in select v from jsonb_array_elements(pool) v loop
      x := x - (r->>'w')::numeric;
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
  return got;
end $$;

-- Donne un pack récompense à un joueur
create or replace function public.bm_give_pack(p_player uuid, p_n int, p_src text)
returns void language sql security definer set search_path = public as $$
  update players set reward_packs = coalesce(reward_packs, '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('n', least(10, greatest(1, p_n)), 'src', p_src, 'at', now())), updated_at = now()
  where id = p_player and p_n > 0;
$$;

-- Ouvre le plus ancien pack récompense
create or replace function public.open_reward_pack()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; rp jsonb; c jsonb; got text[]; cid text; src text;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  select coalesce(reward_packs, '[]'::jsonb), collection into rp, c from players where id = me for update;
  if jsonb_array_length(rp) = 0 then raise exception 'PAS_DE_PACK_RECOMPENSE'; end if;
  src := rp->0->>'src';
  got := bm_draw(least(10, greatest(1, (rp->0->>'n')::int)), 1.25);
  foreach cid in array got loop c := bm_coll_add(c, cid, '1', 1); end loop;
  rp := rp - 0;
  update players set collection = c, reward_packs = rp, updated_at = now() where id = me;
  return jsonb_build_object('cards', to_jsonb(got), 'collection', c, 'reward_packs', rp, 'src', src);
end $$;

-- Victoires en 1 contre 1 → pack de 5 cartes (pas pour une victoire par abandon)
create or replace function public.bm_mm_reward() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' and new.winner in ('host', 'guest')
     and coalesce(new.last_event->>'type', '') <> 'abandon' then
    perform bm_give_pack(case when new.winner = 'host' then new.host else new.guest end, 5, 'memory');
  end if;
  return new;
end $$;
drop trigger if exists mm_reward on public.mm_games;
create trigger mm_reward after update on public.mm_games for each row execute function public.bm_mm_reward();

create or replace function public.bm_qe_reward() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' and new.winner is not null
     and coalesce(new.last_event->>'type', '') <> 'abandon' then
    perform bm_give_pack(new.winner, 5, 'quiestce');
  end if;
  return new;
end $$;
drop trigger if exists qe_reward on public.qe_games;
create trigger qe_reward after update on public.qe_games for each row execute function public.bm_qe_reward();

-- ---------------------------------------------------------
-- MEMORY SOLO
-- niveaux : paires 6, 8, 10, 15, 18 ; erreurs permises 10, 10, 11, 14, 15
-- status : play (en cours) → cleared (niveau réussi, choix : continuer ou s'arrêter) → over (fini)
-- ---------------------------------------------------------
create table if not exists public.mm_solo (
  id uuid primary key default gen_random_uuid(),
  player uuid not null references public.players(id) on delete cascade,
  level int not null default 1,
  done int not null default 0,
  status text not null default 'play' check (status in ('play', 'cleared', 'over')),
  layout jsonb not null,
  matched jsonb not null default '[]'::jsonb,
  pending int,
  errors int not null default 0,
  reward int not null default 0,
  last jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mm_solo enable row level security;
revoke all on public.mm_solo from anon, authenticated;
create index if not exists mm_solo_player on public.mm_solo(player, status);

create or replace function public.mm_solo_pairs(l int) returns int language sql immutable as $$ select (array[6, 8, 10, 15, 18])[l] $$;
create or replace function public.mm_solo_max(l int) returns int language sql immutable as $$ select (array[10, 10, 11, 14, 15])[l] $$;

create or replace function public.mm_solo_layout(l int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ids jsonb;
begin
  select jsonb_agg(c order by random()) into ids from (
    select x.id as c from (select id from bm_cards order by random() limit mm_solo_pairs(l)) x, generate_series(1, 2)) y;
  if ids is null or jsonb_array_length(ids) < mm_solo_pairs(l) * 2 then raise exception 'CATALOGUE_VIDE'; end if;
  return ids;
end $$;

create or replace function public.mm_solo_view(s public.mm_solo) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'level', s.level, 'done', s.done, 'status', s.status,
    'pairs', mm_solo_pairs(s.level), 'max_errors', mm_solo_max(s.level), 'errors', s.errors,
    'matched', coalesce((select jsonb_object_agg(m.i::text, s.layout->(m.i::int)) from jsonb_array_elements_text(s.matched) m(i)), '{}'::jsonb),
    'pending', case when s.pending is null then null else jsonb_build_object('i', s.pending, 'card', s.layout->s.pending) end,
    'last', s.last, 'reward', s.reward)
$$;

-- Termine une série. p_win : on s'arrête après un niveau réussi → pack de (niveaux réussis + 2) cartes
drop function if exists public.mm_solo_finish(public.mm_solo);
create or replace function public.mm_solo_finish(s public.mm_solo, p_win boolean) returns public.mm_solo
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  n := case when p_win and s.done >= 1 then s.done + 2 else 0 end;
  update mm_solo set status = 'over', reward = n, pending = null, updated_at = now() where id = s.id returning * into s;
  if n > 0 then perform bm_give_pack(s.player, n, 'memory-solo'); end if;
  return s;
end $$;

create or replace function public.mm_solo_get()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; s mm_solo;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  select * into s from mm_solo where player = me and status in ('play', 'cleared') order by created_at desc limit 1;
  if not found then return null; end if;
  return mm_solo_view(s);
end $$;

-- Nouvelle série (une série en cours est terminée : récompense seulement si on était entre deux niveaux)
create or replace function public.mm_solo_start()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; s mm_solo;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  for s in select * from mm_solo where player = me and status in ('play', 'cleared') for update loop
    perform mm_solo_finish(s, s.status = 'cleared');
  end loop;
  insert into mm_solo(player, layout) values (me, mm_solo_layout(1)) returning * into s;
  return mm_solo_view(s);
end $$;

create or replace function public.mm_solo_flip(p_id uuid, p_index int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; s mm_solo; j int; ok boolean;
begin
  me := bm_me();
  select * into s from mm_solo where id = p_id and player = me for update;
  if not found then raise exception 'MM_INTROUVABLE'; end if;
  if s.status <> 'play' then raise exception 'MM_DEJA_TRAITEE'; end if;
  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(s.layout)
     or s.matched @> to_jsonb(p_index) or s.pending = p_index then raise exception 'MM_CARTE_INVALIDE'; end if;
  if s.pending is null then
    update mm_solo set pending = p_index, last = null, updated_at = now() where id = s.id returning * into s;
    return mm_solo_view(s);
  end if;
  j := s.pending;
  ok := s.layout->j = s.layout->p_index;
  s.last := jsonb_build_object('i', j, 'j', p_index, 'ci', s.layout->j, 'cj', s.layout->p_index, 'match', ok);
  if ok then
    s.matched := s.matched || jsonb_build_array(j, p_index);
  else
    s.errors := s.errors + 1;
  end if;
  update mm_solo set pending = null, matched = s.matched, errors = s.errors, last = s.last, updated_at = now() where id = s.id returning * into s;
  if jsonb_array_length(s.matched) = jsonb_array_length(s.layout) then
    update mm_solo set done = s.level, status = 'cleared' where id = s.id returning * into s;
    if s.level >= 5 then s := mm_solo_finish(s, true); end if;
  elsif s.errors >= mm_solo_max(s.level) then
    s := mm_solo_finish(s, false);
  end if;
  return mm_solo_view(s);
end $$;

create or replace function public.mm_solo_next(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; s mm_solo;
begin
  me := bm_me();
  select * into s from mm_solo where id = p_id and player = me for update;
  if not found then raise exception 'MM_INTROUVABLE'; end if;
  if s.status <> 'cleared' or s.level >= 5 then raise exception 'MM_DEJA_TRAITEE'; end if;
  update mm_solo set level = s.level + 1, status = 'play', layout = mm_solo_layout(s.level + 1), matched = '[]'::jsonb,
    pending = null, errors = 0, last = null, updated_at = now() where id = s.id returning * into s;
  return mm_solo_view(s);
end $$;

create or replace function public.mm_solo_stop(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; s mm_solo;
begin
  me := bm_me();
  select * into s from mm_solo where id = p_id and player = me for update;
  if not found then raise exception 'MM_INTROUVABLE'; end if;
  if s.status = 'over' then return mm_solo_view(s); end if;
  s := mm_solo_finish(s, s.status = 'cleared');
  return mm_solo_view(s);
end $$;

revoke all on function public.bm_draw(int, numeric), public.bm_give_pack(uuid, int, text), public.bm_mm_reward(), public.bm_qe_reward(),
  public.mm_solo_layout(int), public.mm_solo_view(public.mm_solo), public.mm_solo_finish(public.mm_solo, boolean) from public, anon, authenticated;
revoke all on function public.open_reward_pack(), public.mm_solo_get(), public.mm_solo_start(), public.mm_solo_flip(uuid, int),
  public.mm_solo_next(uuid), public.mm_solo_stop(uuid) from public, anon;
grant execute on function public.open_reward_pack(), public.mm_solo_get(), public.mm_solo_start(), public.mm_solo_flip(uuid, int),
  public.mm_solo_next(uuid), public.mm_solo_stop(uuid) to authenticated;

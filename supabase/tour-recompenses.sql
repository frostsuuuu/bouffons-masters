-- =========================================================
-- TOUR INFERNALE : NOUVELLES RÉCOMPENSES
-- - Plus de limite « 1 montée récompensée toutes les 2 h » : chaque montée donne son pack.
-- - Le pack dépend du palier atteint (10-19, 20-29 … 70-79, tour finie) : plus de cartes
--   ET de meilleurs taux à chaque palier. Les paliers sont réglés dans js/config.js (tour.paliers)
--   et recopiés ici par sync_catalog quand un admin ouvre le jeu.
-- - Anti-farm : une nouvelle montée ne peut pas commencer avant que la précédente ait fini
--   de se jouer à l'écran (vitesse ×4), même en appelant le serveur directement.
-- Ce fichier remplace sync_catalog, tour_play, tour_status (tour-serveur.sql) et open_reward_pack (recompenses.sql).
-- =========================================================
alter table public.bm_settings add column if not exists tour_tiers jsonb not null default '[]'::jsonb;
alter table public.tour_runs add column if not exists busy_until timestamptz;

create or replace function public.sync_catalog(p_cards jsonb, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; c jsonb; k text;
begin
  me := bm_me();
  if me is null or not exists (select 1 from players where id = me and is_admin) then raise exception 'PAS_ADMIN'; end if;
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) = 0 then raise exception 'CATALOGUE_VIDE'; end if;
  delete from bm_cards where id not in (select e->>'id' from jsonb_array_elements(p_cards) e);
  insert into bm_cards (id, rarete, atk, def, nom)
    select e->>'id', e->>'rarete', (e->>'atk')::int, (e->>'def')::int, e->>'nom' from jsonb_array_elements(p_cards) e
    where coalesce(e->>'id', '') <> '' and coalesce(e->>'rarete', '') <> ''
    on conflict (id) do update set rarete = excluded.rarete,
      atk = coalesce(excluded.atk, bm_cards.atk), def = coalesce(excluded.def, bm_cards.def), nom = coalesce(excluded.nom, bm_cards.nom);
  insert into bm_settings (id) values (1) on conflict (id) do nothing;
  update bm_settings set
    cards_per_booster = coalesce((p_settings->>'cards_per_booster')::int, cards_per_booster),
    recharge_minutes  = coalesce((p_settings->>'recharge_minutes')::numeric, recharge_minutes),
    boosters_max      = (p_settings->>'boosters_max')::int,
    boosters_start    = coalesce((p_settings->>'boosters_start')::int, boosters_start),
    guarantee         = p_settings->>'guarantee',
    rarities          = coalesce(p_settings->'rarities', rarities),
    test_mode         = coalesce((p_settings->>'test_mode')::boolean, false),
    tour_tiers        = coalesce(p_settings->'tour_tiers', tour_tiers)
  where id = 1;
  if exists (select 1 from players where id = me and auto_all) then
    select collection into c from players where id = me for update;
    for k in select id from bm_cards loop
      if not exists (select 1 from jsonb_each_text(coalesce(c->k, '{}'::jsonb)) e where e.value::int > 0) then
        c := bm_coll_add(c, k, '1', 1);
      end if;
    end loop;
    update players set collection = c, updated_at = now() where id = me;
    return public.my_player();
  end if;
  return null;
end $$;

-- Pack récompense à taux propres : w = poids par rareté, g = rareté minimum de la dernière carte
create or replace function public.bm_give_pack_w(p_player uuid, p_n int, p_src text, p_w jsonb, p_g text, p_name text)
returns void language sql security definer set search_path = public as $$
  update players set reward_packs = coalesce(reward_packs, '[]'::jsonb)
    || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('n', least(10, greatest(1, p_n)), 'src', p_src, 'at', now(), 'w', p_w, 'g', p_g, 'nom', p_name))), updated_at = now()
  where id = p_player and p_n > 0;
$$;

-- Tirage avec des poids donnés (mêmes règles que bm_draw : raretés sans carte ignorées, garantie sur la dernière carte)
create or replace function public.bm_draw_w(p_n int, p_w jsonb, p_g text)
returns text[] language plpgsql security definer set search_path = public as $$
declare s bm_settings; i int; pool jsonb; total numeric; x numeric; r jsonb; chosen text; cid text; got text[] := '{}'; g text;
begin
  select * into s from bm_settings where id = 1;
  if not found or not exists (select 1 from bm_cards) then raise exception 'CATALOGUE_VIDE'; end if;
  g := coalesce(p_g, s.guarantee);
  for i in 1..p_n loop
    select coalesce(jsonb_agg(jsonb_build_object('id', e.v->>'id', 'w', greatest(coalesce((p_w->>(e.v->>'id'))::numeric, 0), 0)) order by e.ord), '[]'::jsonb) into pool
    from jsonb_array_elements(s.rarities) with ordinality e(v, ord)
    where exists (select 1 from bm_cards k where k.rarete = e.v->>'id')
      and (i < p_n or g is null
           or e.ord >= coalesce((select o.ord from jsonb_array_elements(s.rarities) with ordinality o(v, ord) where o.v->>'id' = g), 0));
    select sum((v->>'w')::numeric) into total from jsonb_array_elements(pool) v;
    if jsonb_array_length(pool) = 0 or coalesce(total, 0) <= 0 then
      select coalesce(jsonb_agg(jsonb_build_object('id', e.v->>'id', 'w', greatest((e.v->>'poids')::numeric, 0)) order by e.ord), '[]'::jsonb) into pool
      from jsonb_array_elements(s.rarities) with ordinality e(v, ord)
      where exists (select 1 from bm_cards k where k.rarete = e.v->>'id');
      select sum((v->>'w')::numeric) into total from jsonb_array_elements(pool) v;
    end if;
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
  select array_agg(gg.id order by coalesce(o.ord, 0), gg.n) into got
  from unnest(got) with ordinality gg(id, n)
  join bm_cards k on k.id = gg.id
  left join jsonb_array_elements(s.rarities) with ordinality o(v, ord) on o.v->>'id' = k.rarete;
  return got;
end $$;

create or replace function public.open_reward_pack()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; rp jsonb; c jsonb; got text[]; cid text; src text;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  select coalesce(reward_packs, '[]'::jsonb), collection into rp, c from players where id = me for update;
  if jsonb_array_length(rp) = 0 then raise exception 'PAS_DE_PACK_RECOMPENSE'; end if;
  src := rp->0->>'src';
  if rp->0 ? 'w' then
    got := bm_draw_w(least(10, greatest(1, (rp->0->>'n')::int)), rp->0->'w', rp->0->>'g'); -- pack à taux propres (tour)
  else
    got := bm_draw(least(10, greatest(1, (rp->0->>'n')::int)), 1.25);
  end if;
  foreach cid in array got loop c := bm_coll_add(c, cid, '1', 1); end loop;
  rp := rp - 0;
  update players set collection = c, reward_packs = rp, updated_at = now() where id = me;
  return jsonb_build_object('cards', to_jsonb(got), 'collection', c, 'reward_packs', rp, 'src', src);
end $$;

create or replace function public.tour_play(p_team jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; coll jsonb; e jsonb; tower jsonb; team jsonb := '[]'::jsonb; ids text[] := '{}';
        nt int; nf int; cur int := 0; fl int := 0; my_hp int := 100; foe_hp int := 100; hps int[];
        mine_turn boolean := true; a int; d int; r numeric; crit boolean; dmg int; log jsonb := '[]'::jsonb;
        conquered boolean := false; reached int; kills int := 0; reward int := 0; rec tour_records; is_rec boolean := false;
        guard int := 0; s bm_settings; tier jsonb; busy timestamptz; dur numeric;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  -- Rythme : pas de nouvelle montée tant que la précédente n'a pas fini de se jouer (à la vitesse ×4)
  select busy_until into busy from tour_runs where player = me order by at desc limit 1;
  if busy is not null and busy > now() then raise exception 'TOUR_EN_COURS'; end if;
  if jsonb_typeof(p_team) <> 'array' or jsonb_array_length(p_team) < 1 or jsonb_array_length(p_team) > 5 then raise exception 'TOUR_INVALIDE'; end if;
  select collection into coll from players where id = me for update;
  for e in select value from jsonb_array_elements(p_team) loop
    if (e->>'id') = any(ids) then raise exception 'TOUR_INVALIDE'; end if;
    if coalesce((coll #>> array[e->>'id', e->>'level'])::int, 0) <= 0 then raise exception 'TOUR_INVALIDE'; end if;
    select jsonb_build_object('id', id, 'level', (e->>'level')::int, 'atk', bm_stat(atk, (e->>'level')::int), 'def', bm_stat(def, (e->>'level')::int))
      into e from bm_cards where id = e->>'id' and atk is not null;
    if e is null then raise exception 'TOUR_INVALIDE'; end if;
    team := team || jsonb_build_array(e);
    ids := ids || (e->>'id');
  end loop;
  tower := bm_tower();
  nt := jsonb_array_length(team);
  nf := jsonb_array_length(tower);
  if nf = 0 then raise exception 'CATALOGUE_VIDE'; end if;
  hps := array_fill(100, array[nt]);
  -- Combat : chacun son tour, ta carte frappe en premier à chaque nouveau duel.
  -- dégâts = 80 × (attaque / (attaque + défense))² × (0,85 à 1,15), critique 10 % × 1,5, minimum 1
  -- Après chaque étage gagné, ta carte récupère 13 PV (max 100).
  loop
    guard := guard + 1;
    exit when guard > 20000;
    if mine_turn then
      a := (team->cur->>'atk')::int; d := (tower->fl->>'def')::int;
    else
      a := (tower->fl->>'atk')::int; d := (team->cur->>'def')::int;
    end if;
    r := a::numeric / greatest(1, a + d);
    crit := random() < 0.1;
    dmg := greatest(1, round(80 * r * r * (0.85 + random() * 0.3) * (case when crit then 1.5 else 1 end))::int);
    log := log || jsonb_build_array(jsonb_build_array(case when mine_turn then 0 else 1 end, dmg, case when crit then 1 else 0 end));
    if mine_turn then foe_hp := foe_hp - dmg; else hps[cur + 1] := hps[cur + 1] - dmg; end if;
    mine_turn := not mine_turn;
    if foe_hp <= 0 then
      kills := kills + 1;
      if fl + 1 >= nf then conquered := true; exit; end if;
      fl := fl + 1; foe_hp := 100; mine_turn := true;
      hps[cur + 1] := least(100, hps[cur + 1] + 13); -- soin après chaque étage gagné
    elsif hps[cur + 1] <= 0 then
      if cur + 1 >= nt then exit; end if;
      cur := cur + 1; mine_turn := true;
    end if;
  end loop;
  reached := case when conquered then nf else fl + 1 end;
  -- Durée de la montée à l'écran en vitesse ×4 (≈ 175 ms par coup, 325 ms par changement de carte) : rythme minimum
  dur := 175 + jsonb_array_length(log) * 175 + (kills + cur + 1) * 325;
  busy := now() + make_interval(secs => dur * 0.9 / 1000);
  -- Récompense : un pack à chaque montée, de plus en plus fort selon le palier atteint (réglages de config.js → tour.paliers)
  select * into s from bm_settings where id = 1;
  select t into tier from jsonb_array_elements(coalesce(s.tour_tiers, '[]'::jsonb)) t
    where (conquered and coalesce((t->>'fin')::boolean, false))
       or (not coalesce((t->>'fin')::boolean, false) and (t->>'etage')::int <= reached)
    order by coalesce((t->>'fin')::boolean, false) desc, (t->>'etage')::int desc nulls last
    limit 1;
  if tier is not null then
    reward := least(10, greatest(1, (tier->>'cartes')::int));
  end if;
  insert into tour_runs(player, floor, team, reward, busy_until) values (me, reached, team, reward, busy);
  if reward > 0 then perform bm_give_pack_w(me, reward, 'tour', tier->'poids', tier->>'garantie', tier->>'nom'); end if;
  -- Classement
  select * into rec from tour_records where player = me;
  if not found or reached > rec.floor then
    insert into tour_records(player, floor, team, at) values (me, reached, (select jsonb_agg(jsonb_build_object('id', x->>'id', 'level', (x->>'level')::int)) from jsonb_array_elements(team) x), now())
      on conflict (player) do update set floor = excluded.floor, team = excluded.team, at = excluded.at;
    is_rec := true;
  end if;
  return jsonb_build_object('team', team, 'tower', (select jsonb_agg(t.v order by t.o) from jsonb_array_elements(tower) with ordinality t(v, o) where t.o <= least(nf, reached + 1)),
    'floors', nf, 'log', log, 'floor', reached, 'conquered', conquered, 'kills', kills,
    'reward', reward, 'tier', tier, 'record', is_rec, 'busy_until', busy);
end $$;

create or replace function public.tour_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  return jsonb_build_object('tower', bm_tower(), 'tiers', (select tour_tiers from bm_settings where id = 1),
    'busy_until', (select busy_until from tour_runs where player = me and busy_until > now() order by at desc limit 1));
end $$;

revoke all on function public.bm_give_pack_w(uuid, int, text, jsonb, text, text), public.bm_draw_w(int, jsonb, text) from public, anon, authenticated;
revoke all on function public.tour_play(jsonb), public.tour_status(), public.open_reward_pack(), public.sync_catalog(jsonb, jsonb) from public, anon;
grant execute on function public.tour_play(jsonb), public.tour_status(), public.open_reward_pack(), public.sync_catalog(jsonb, jsonb) to authenticated;

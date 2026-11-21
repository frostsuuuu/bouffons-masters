-- =========================================================
-- TOUR INFERNALE CÔTÉ SERVEUR (+ récompense)
-- Le combat est tiré au sort par le serveur (impossible de tricher) :
--  - tour_play(équipe) vérifie l'équipe, calcule la tour, fait tout le combat,
--    met à jour le classement, donne la récompense et renvoie le déroulé des coups
--    pour que le jeu les rejoue à l'écran.
-- Récompense : un pack récompense (chance +25 %) selon l'étage atteint :
--   étage < 10 : rien · 10-19 : 3 cartes · 20-29 : 4 · … · 70-79 : 9 · tour finie : 10
--   1 montée récompensée toutes les 2 heures (les autres comptent pour le classement).
-- Les stats des cartes (attaque, défense, nom) sont recopiées depuis cards.js par sync_catalog.
-- =========================================================
alter table public.bm_cards add column if not exists atk int;
alter table public.bm_cards add column if not exists def int;
alter table public.bm_cards add column if not exists nom text;

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
    test_mode         = coalesce((p_settings->>'test_mode')::boolean, false)
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

-- Stats d'une carte à un niveau (+25 % par étoile, comme dans le jeu)
create or replace function public.bm_stat(base int, lv int) returns int language sql immutable as $$
  select round(coalesce(base, 0) * (1 + 0.25 * (greatest(lv, 1) - 1))::numeric)::int $$;

-- La tour : 80 étages [{id, level, atk, def}]
create or replace function public.bm_tower() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare base jsonb; cand jsonb; nb int; extra int; n int; top int; i int; k int; used int[] := '{}'; out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'level', 1, 'atk', atk, 'def', def) order by atk + def, nom, id), '[]'::jsonb)
    into base from bm_cards where atk is not null and def is not null;
  nb := jsonb_array_length(base);
  out := base;
  extra := 80 - nb;
  if extra <= 0 or nb = 0 then return out; end if;
  top := (base->(nb - 1)->>'atk')::int + (base->(nb - 1)->>'def')::int;
  select coalesce(jsonb_agg(jsonb_build_object('id', b.v->>'id', 'level', lv, 'atk', bm_stat((b.v->>'atk')::int, lv), 'def', bm_stat((b.v->>'def')::int, lv))
      order by bm_stat((b.v->>'atk')::int, lv) + bm_stat((b.v->>'def')::int, lv), b.ord, lv), '[]'::jsonb)
    into cand
    from jsonb_array_elements(base) with ordinality b(v, ord), generate_series(2, 7) lv
    where bm_stat((b.v->>'atk')::int, lv) + bm_stat((b.v->>'def')::int, lv) > top;
  n := jsonb_array_length(cand);
  if n = 0 then return out; end if;
  for i in 0..extra - 1 loop
    k := round(i * (n - 1)::numeric / greatest(1, extra - 1))::int;
    while k = any(used) and k < n - 1 loop k := k + 1; end loop;
    used := used || k;
    out := out || jsonb_build_array(cand->k);
  end loop;
  return out;
end $$;

create table if not exists public.tour_runs (
  id bigserial primary key,
  player uuid not null references public.players(id) on delete cascade,
  floor int not null,
  team jsonb not null,
  reward int not null default 0,
  at timestamptz not null default now()
);
alter table public.tour_runs enable row level security;
revoke all on public.tour_runs from anon, authenticated;
create index if not exists tour_runs_player on public.tour_runs(player, at desc);

-- Prochaine montée récompensée possible
create or replace function public.bm_tour_next_reward(p uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce((select max(at) + interval '2 hours' from tour_runs where player = p and reward > 0), '-infinity'::timestamptz)
$$;

create or replace function public.tour_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid; nx timestamptz;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  nx := bm_tour_next_reward(me);
  return jsonb_build_object('tower', bm_tower(), 'next_reward_at', case when nx > now() then nx end);
end $$;

create or replace function public.tour_play(p_team jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; coll jsonb; e jsonb; tower jsonb; team jsonb := '[]'::jsonb; ids text[] := '{}';
        nt int; nf int; cur int := 0; fl int := 0; my_hp int := 100; foe_hp int := 100; hps int[];
        mine_turn boolean := true; a int; d int; r numeric; crit boolean; dmg int; log jsonb := '[]'::jsonb;
        conquered boolean := false; reached int; kills int := 0; reward int := 0; rec tour_records; is_rec boolean := false;
        nx timestamptz; guard int := 0;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
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
    elsif hps[cur + 1] <= 0 then
      if cur + 1 >= nt then exit; end if;
      cur := cur + 1; mine_turn := true;
    end if;
  end loop;
  reached := case when conquered then nf else fl + 1 end;
  -- Récompense
  nx := bm_tour_next_reward(me);
  if nx <= now() then
    reward := case when conquered then 10 when reached < 10 then 0 else least(9, 2 + reached / 10) end;
  end if;
  insert into tour_runs(player, floor, team, reward) values (me, reached, team, reward);
  if reward > 0 then perform bm_give_pack(me, reward, 'tour'); end if;
  -- Classement
  select * into rec from tour_records where player = me;
  if not found or reached > rec.floor then
    insert into tour_records(player, floor, team, at) values (me, reached, (select jsonb_agg(jsonb_build_object('id', x->>'id', 'level', (x->>'level')::int)) from jsonb_array_elements(team) x), now())
      on conflict (player) do update set floor = excluded.floor, team = excluded.team, at = excluded.at;
    is_rec := true;
  end if;
  return jsonb_build_object('team', team, 'tower', (select jsonb_agg(t.v order by t.o) from jsonb_array_elements(tower) with ordinality t(v, o) where t.o <= least(nf, reached + 1)),
    'floors', nf, 'log', log, 'floor', reached, 'conquered', conquered, 'kills', kills,
    'reward', reward, 'record', is_rec, 'next_reward_at', bm_tour_next_reward(me));
end $$;

drop function if exists public.tour_submit(int, jsonb);
revoke all on function public.bm_stat(int, int), public.bm_tower(), public.bm_tour_next_reward(uuid) from public, anon, authenticated;
revoke all on function public.tour_play(jsonb), public.tour_status() from public, anon;
grant execute on function public.tour_play(jsonb), public.tour_status() to authenticated;
update bm_cards k set atk = v.atk, def = v.def, nom = v.nom from (values ('killian-accart',13,17,'Accart'),('tayshan',20,14,'Tayshan'),('esteban',16,14,'Esté'),('elouan-chauve',51,44,'Elouan Chauve'),('evan-calvitie',78,72,'Evan Calvitie'),('seif',52,46,'Seif'),('ajmol',61,54,'Ajmol'),('krimi-chatte',111,104,'Krimi Chatte'),('mikha-albinos',49,47,'Mikha Albinos'),('monsieur-kouaye',80,90,'Monsieur Kouaye'),('petit-nael-gilles-verdez',84,84,'Naël x Gilles Verdez'),('cousin-baveux',139,126,'Cousin baveux'),('josue',75,80,'Josué Auschwitz'),('yass-merguez',55,49,'Yass Merguez'),('krimi-jeu-des-memes',114,108,'Krimi Jeu des Mèmes'),('massy',16,15,'Massy'),('quentin-bedo',46,53,'Quentin Bédo'),('tony-draou-bossu',82,71,'Tony Draou Bossu'),('mr-laouer',52,50,'Mr. Laouer'),('paul-vrai-calvitie',55,59,'Paul vrai calvitie'),('oulmou',16,19,'Oulmou'),('tsm',18,13,'TSM'),('frosty',22,18,'Frosty'),('le-bottier',14,19,'Le Bottier'),('laps-chose',47,54,'Laps Chose'),('aylann',19,16,'Aylann'),('will',59,50,'Will'),('ismael',22,18,'Ismael'),('evan-linkedin',49,63,'Evan Linkedin'),('zuzurl',65,48,'ZuzuRL'),('gp-vouille-gp-zennadi',113,122,'GP Zennadi x GP Vouille'),('solane-aviateur',59,52,'Solane aviateur'),('bat',19,17,'Bat'),('cerfio',82,78,'Cerfion'),('evan-jonesy',51,55,'Evan Jonesy'),('bebe-bat-blm',52,51,'Bébé Bat BLM'),('hmd',17,16,'HMD'),('nabil',17,20,'Nabil'),('bebe-nael',49,51,'Bébé Nael'),('krimi-pipi-chien',86,77,'Krimi Pipi Chien'),('oulmou-buzz-cut',84,81,'Oulmou Buzz Cut'),('mikha',18,15,'Mikha'),('adam',16,16,'Adam'),('cooki',18,21,'Cooki'),('frosty-baillone',49,58,'Frosty Bailloné'),('maxence-lahont',53,57,'Maxence Lahont'),('evan-leon',61,47,'Evan Léon'),('nachita',15,23,'Nachita'),('ritchie',23,16,'Ritchie'),('luna',16,20,'Luna'),('mimi',14,21,'Mimi'),('big-aubert',110,118,'Big Aubert'),('steven',15,19,'Steven'),('bat-chez-legend-hair',80,78,'Bat chez Légend''Hair'),('krimi-petit',48,49,'Krimi Petit'),('evan-enfant',17,15,'Evan enfant'),('nael-enfant',16,21,'Nael enfant'),('mathis-enfant',20,18,'Mathis enfant'),('tayshan-enfant',23,15,'Tayshan enfant')) v(id, atk, def, nom) where k.id = v.id;

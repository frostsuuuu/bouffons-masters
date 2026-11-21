-- =========================================================
-- TOUR INFERNALE : classement des records
-- Un record par joueur (son meilleur étage) avec l'équipe utilisée.
-- Le serveur vérifie que l'équipe vient bien de la collection du joueur.
-- =========================================================
create table if not exists public.tour_records (
  player uuid primary key references public.players(id) on delete cascade,
  floor int not null check (floor between 1 and 200),
  team jsonb not null,            -- [{ "id": carte, "level": niveau }] dans l'ordre de passage
  at timestamptz not null default now()
);
alter table public.tour_records enable row level security;
revoke all on public.tour_records from anon, authenticated;

-- Envoie un résultat ; garde seulement le meilleur étage du joueur
create or replace function public.tour_submit(p_floor int, p_team jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid; coll jsonb; e jsonb; n int; cur tour_records; clean jsonb := '[]'::jsonb;
begin
  me := bm_me();
  if me is null then raise exception 'PAS_DE_COMPTE'; end if;
  if p_floor is null or p_floor < 1 or p_floor > 200 then raise exception 'TOUR_INVALIDE'; end if;
  if jsonb_typeof(p_team) <> 'array' then raise exception 'TOUR_INVALIDE'; end if;
  n := jsonb_array_length(p_team);
  if n < 1 or n > 5 then raise exception 'TOUR_INVALIDE'; end if;
  select collection into coll from players where id = me;
  for e in select value from jsonb_array_elements(p_team) loop
    if not exists (select 1 from bm_cards where id = e->>'id') then raise exception 'TOUR_INVALIDE'; end if;
    if coalesce((coll #>> array[e->>'id', (e->>'level')]) ::int, 0) <= 0 then raise exception 'TOUR_INVALIDE'; end if;
    clean := clean || jsonb_build_array(jsonb_build_object('id', e->>'id', 'level', (e->>'level')::int));
  end loop;
  select * into cur from tour_records where player = me;
  if not found or p_floor > cur.floor then
    insert into tour_records(player, floor, team, at) values (me, p_floor, clean, now())
      on conflict (player) do update set floor = excluded.floor, team = excluded.team, at = excluded.at
      returning * into cur;
    return jsonb_build_object('record', true, 'floor', cur.floor);
  end if;
  return jsonb_build_object('record', false, 'floor', cur.floor);
end $$;

-- Classement : les meilleurs étages (à égalité, le premier arrivé passe devant)
create or replace function public.tour_top(p_limit int default 10)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.floor desc, x.at), '[]'::jsonb) from (
    select r.floor, r.team, r.at, p.id as player, p.pseudo, (p.id = bm_me()) as me
    from tour_records r join players p on p.id = r.player
    order by r.floor desc, r.at limit least(greatest(coalesce(p_limit, 10), 1), 50)) x
$$;

revoke all on function public.tour_submit(int, jsonb), public.tour_top(int) from public, anon;
grant execute on function public.tour_submit(int, jsonb), public.tour_top(int) to authenticated;

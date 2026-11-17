-- MISE À JOUR : étoiles arc-en-ciel (à coller UNE fois dans Supabase > SQL Editor > Run)
-- Permet de fusionner jusqu'au niveau 7 (★★★ arc-en-ciel) au lieu de 5.

-- Fusion : 2 exemplaires au niveau L → 1 exemplaire au niveau L+1
-- (niveau 1 = sans étoile, 2 à 4 = ★ à ★★★ dorées, 5 à 7 = ★ à ★★★ arc-en-ciel ; 7 = max)
create or replace function public.fuse_card(p_card text, p_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  if auth.uid() is null then raise exception 'NON_CONNECTE'; end if;
  if p_level < 1 or p_level >= 7 then raise exception 'Niveau max atteint'; end if;
  select collection into c from players where id = auth.uid() for update;
  c := bm_coll_add(c, p_card, p_level::text, -2);
  c := bm_coll_add(c, p_card, (p_level + 1)::text, 1);
  update players set collection = c, updated_at = now() where id = auth.uid();
  return c;
end $$;

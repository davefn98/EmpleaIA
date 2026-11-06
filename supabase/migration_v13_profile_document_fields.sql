-- Datos del perfil que el editor ofrece y debe conservar al recargar.
-- Requiere migration_v12_profile_target_job_description.sql.
-- No cambia funciones ni datos de eliminación de cuentas (HU10 en revisión).
begin;

alter table public.profiles add column if not exists linkedin text;
alter table public.profiles add column if not exists portfolio text;
alter table public.profiles add column if not exists certifications text[] default '{}';

create or replace function public.replace_current_user_profile_data_v2(
  p_profile jsonb,
  p_academic jsonb default '[]'::jsonb,
  p_work jsonb default '[]'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  -- El guardado previo y los campos nuevos comparten la misma transacción.
  perform public.replace_current_user_profile_data(
    p_profile - array['linkedin','portfolio','certifications'], p_academic, p_work
  );
  update public.profiles set
    linkedin = case when p_profile ? 'linkedin' then p_profile->>'linkedin' else linkedin end,
    portfolio = case when p_profile ? 'portfolio' then p_profile->>'portfolio' else portfolio end,
    certifications = case when p_profile ? 'certifications'
      then array(select jsonb_array_elements_text(p_profile->'certifications'))
      else certifications end,
    updated_at = now()
  where id = v_user_id returning * into v_profile;
  if not found then raise exception 'profile not found'; end if;
  return to_jsonb(v_profile);
end;
$$;

revoke all on function public.replace_current_user_profile_data_v2(jsonb,jsonb,jsonb) from public;
grant execute on function public.replace_current_user_profile_data_v2(jsonb,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;

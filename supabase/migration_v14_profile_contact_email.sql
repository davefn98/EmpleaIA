-- Requiere migration_v13_profile_document_fields.sql.
begin;

-- NULL conserva el valor de los perfiles existentes. Una cadena vacía
-- representa un correo de contacto borrado explícitamente.
alter table public.profiles add column if not exists contact_email text;

create or replace function public.replace_current_user_profile_data_v3(
  p_profile jsonb,
  p_academic jsonb default '[]'::jsonb,
  p_work jsonb default '[]'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_profile public.profiles;
begin
  perform public.replace_current_user_profile_data_v2(
    p_profile - array['contact_email', 'email'], p_academic, p_work
  );
  update public.profiles
    set contact_email = p_profile->>'contact_email'
    where id = auth.uid()
    returning * into v_profile;
  if not found then raise exception 'profile not found'; end if;
  return to_jsonb(v_profile);
end;
$$;

revoke all on function public.replace_current_user_profile_data_v3(jsonb,jsonb,jsonb) from public;
grant execute on function public.replace_current_user_profile_data_v3(jsonb,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;

-- Operaciones atómicas para guardar el perfil profesional y eliminar datos.
create or replace function public.replace_current_user_profile_data(p_profile jsonb, p_academic jsonb default '[]'::jsonb, p_work jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_profile public.profiles;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  update public.profiles set
    first_name=coalesce(p_profile->>'first_name',first_name), last_name=coalesce(p_profile->>'last_name',last_name),
    email=coalesce(p_profile->>'email',email), phone=case when p_profile?'phone' then p_profile->>'phone' else phone end,
    location=case when p_profile?'location' then p_profile->>'location' else location end,
    career=coalesce(p_profile->>'career',career), target_role=coalesce(p_profile->>'target_role',target_role),
    bio=case when p_profile?'bio' then p_profile->>'bio' else bio end,
    technical_skills=case when p_profile?'technical_skills' then array(select jsonb_array_elements_text(p_profile->'technical_skills')) else technical_skills end,
    soft_skills=case when p_profile?'soft_skills' then array(select jsonb_array_elements_text(p_profile->'soft_skills')) else soft_skills end,
    updated_at=now() where id=v_user_id returning * into v_profile;
  if not found then raise exception 'profile not found'; end if;
  delete from public.academic_background where profile_id=v_user_id;
  insert into public.academic_background(profile_id,institution,degree,start_date,end_date,description)
    select v_user_id,x.institution,x.degree,x.start_date,x.end_date,x.description from jsonb_to_recordset(coalesce(p_academic,'[]')) as x(institution text,degree text,start_date date,end_date date,description text);
  delete from public.work_experience where profile_id=v_user_id;
  insert into public.work_experience(profile_id,company,role,start_date,end_date,description,achievements)
    select v_user_id,x.company,x.role,x.start_date,x.end_date,coalesce(x.description,''),coalesce(x.achievements,'{}') from jsonb_to_recordset(coalesce(p_work,'[]')) as x(company text,role text,start_date date,end_date date,description text,achievements text[]);
  return to_jsonb(v_profile);
end; $$;

create or replace function public.delete_current_user_data() returns void language plpgsql security invoker set search_path=public as $$
declare v_user_id uuid := auth.uid(); begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  delete from public.ai_provider_credentials where user_id=v_user_id;
  delete from public.ai_model_preferences where user_id=v_user_id;
  delete from public.profiles where id=v_user_id;
end; $$;

revoke all on function public.replace_current_user_profile_data(jsonb,jsonb,jsonb) from public;
grant execute on function public.replace_current_user_profile_data(jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.delete_current_user_data() from public;
grant execute on function public.delete_current_user_data() to authenticated;

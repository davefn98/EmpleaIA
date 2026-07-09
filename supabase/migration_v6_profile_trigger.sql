-- migration_v6_profile_trigger.sql
-- ---------------------------------------------------------------------------
-- Crea automáticamente una fila en public.profiles cuando se registra un
-- usuario en auth.users.
--
-- Por qué: hasta ahora el perfil se insertaba desde el cliente justo después
-- de signUp. Si la confirmación por email está activada, signUp NO crea sesión,
-- por lo que la RLS rechazaba el insert y quedaban usuarios de Auth sin perfil.
-- Con un trigger SECURITY DEFINER el perfil se crea del lado del servidor,
-- funcione o no la confirmación por email.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase Cloud.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, career, target_role, bio)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'career', ''),
    coalesce(new.raw_user_meta_data->>'target_role', ''),
    coalesce(new.raw_user_meta_data->>'bio', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

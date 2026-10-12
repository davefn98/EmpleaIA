-- migration_v10_fix_profile_trigger.sql
-- ---------------------------------------------------------------------------
-- Crea o reemplaza de forma idempotente la función y trigger de public.profiles.
--
-- Soporta:
-- - Diferentes nombres de claves en la metadata: first_name, firstName, full_name.
-- - No inventa información ficticia como "Estudiante". Si faltan campos
--   profesionales, se guardan como cadenas vacías '' para no violar la
--   restricción NOT NULL de public.profiles. El frontend los identificará
--   como incompletos.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name text;
  v_last_name text;
  v_full_name text;
BEGIN
  v_first_name := COALESCE(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'firstName', '');
  v_last_name := COALESCE(new.raw_user_meta_data->>'last_name', new.raw_user_meta_data->>'lastName', '');
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'fullName', '');

  -- Soporte para full_name dividido si first_name está vacío
  IF v_first_name = '' AND v_full_name <> '' THEN
    v_first_name := split_part(v_full_name, ' ', 1);
    v_last_name := substr(v_full_name, length(v_first_name) + 2);
  END IF;

  INSERT INTO public.profiles (id, email, first_name, last_name, career, target_role, bio)
  VALUES (
    new.id,
    COALESCE(new.email, ''),
    v_first_name,
    v_last_name,
    COALESCE(new.raw_user_meta_data->>'career', ''),
    COALESCE(new.raw_user_meta_data->>'target_role', ''),
    COALESCE(new.raw_user_meta_data->>'bio', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

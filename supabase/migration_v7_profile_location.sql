-- migration_v7_profile_location.sql
-- ---------------------------------------------------------------------------
-- Añade la columna "location" (Ubicación) a la tabla profiles.
--
-- Por qué: la interfaz (ProfileView, cálculo de completitud del perfil, etc.)
-- ya muestra y usa el campo "Ubicación", pero la columna nunca se creó en la
-- base de datos, por lo que cualquier intento de guardarla fallaba con
-- "Could not find the 'location' column of 'profiles'".
--
-- Ejecutar una sola vez en el SQL Editor de Supabase Cloud.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location text;

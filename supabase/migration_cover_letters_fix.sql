-- =============================================================
-- EmpleaIA — MIGRACIÓN DE FIX PARA CARTAS DE PRESENTACIÓN
-- Ejecutar este archivo en Supabase SQL Editor.
-- =============================================================

-- 1. Agregar columnas a public.cover_letters de forma segura
ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS document_title text;

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'generated';

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS company text;

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS target_role text;

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS job_description text;

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS tone text;

-- 2. Agregar constraint de status (eliminar si ya existe primero)
ALTER TABLE public.cover_letters
  DROP CONSTRAINT IF EXISTS cover_letters_status_check;

ALTER TABLE public.cover_letters
  ADD CONSTRAINT cover_letters_status_check
  CHECK (status IN ('draft', 'generated', 'downloaded', 'pending'));

-- 3. Crear función de utilidad para set_updated_at si no existe
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Crear trigger para actualizar updated_at automáticamente
DROP TRIGGER IF EXISTS set_cover_letters_updated_at ON public.cover_letters;

CREATE TRIGGER set_cover_letters_updated_at
  BEFORE UPDATE ON public.cover_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5. Recargar esquema de PostgREST
NOTIFY pgrst, 'reload schema';

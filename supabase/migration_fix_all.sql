-- =============================================================
-- EmpleaIA — MIGRACIÓN DE FIX TOTAL (CARTAS Y CVS)
-- Ejecutar este archivo completo en el SQL Editor de Supabase.
-- =============================================================

-- 1. Reparar tabla cover_letters
ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS document_title text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS target_role text,
  ADD COLUMN IF NOT EXISTS job_description text,
  ADD COLUMN IF NOT EXISTS tone text;

ALTER TABLE public.cover_letters
  DROP CONSTRAINT IF EXISTS cover_letters_status_check;

ALTER TABLE public.cover_letters
  ADD CONSTRAINT cover_letters_status_check
  CHECK (status IN ('draft', 'generated', 'downloaded', 'pending'));

-- 2. Reparar tabla generated_cvs
ALTER TABLE public.generated_cvs
  ADD COLUMN IF NOT EXISTS document_title text,
  ADD COLUMN IF NOT EXISTS cv_style jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'generated';

ALTER TABLE public.generated_cvs
  DROP CONSTRAINT IF EXISTS generated_cvs_status_check;

ALTER TABLE public.generated_cvs
  ADD CONSTRAINT generated_cvs_status_check
  CHECK (status IN ('draft', 'generated', 'downloaded', 'pending'));

-- 3. Crear función de utilidad para set_updated_at si no existe
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Crear triggers de actualización
DROP TRIGGER IF EXISTS set_cover_letters_updated_at ON public.cover_letters;
CREATE TRIGGER set_cover_letters_updated_at
  BEFORE UPDATE ON public.cover_letters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_generated_cvs_updated_at ON public.generated_cvs;
CREATE TRIGGER set_generated_cvs_updated_at
  BEFORE UPDATE ON public.generated_cvs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Recargar esquema
NOTIFY pgrst, 'reload schema';

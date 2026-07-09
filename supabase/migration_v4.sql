-- =============================================================
-- EmpleaIA — MIGRACIÓN v4 + v4b
-- SOLO ejecutar este archivo en Supabase SQL Editor.
-- NO ejecutar schema.sql completo si la BD ya está creada.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- PARTE 1: Nuevas columnas en tablas existentes
-- ──────────────────────────────────────────────────────────────

-- 1a. Ubicación en perfiles (HU05)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location text;

-- 1b. CVs generados: metadatos de borradores (HU13)
ALTER TABLE public.generated_cvs
  ADD COLUMN IF NOT EXISTS document_title text;

ALTER TABLE public.generated_cvs
  ADD COLUMN IF NOT EXISTS cv_style jsonb;

ALTER TABLE public.generated_cvs
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone
    DEFAULT timezone('utc'::text, now());

ALTER TABLE public.generated_cvs
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'generated';

-- Agregar constraint de status (eliminar si ya existe primero)
ALTER TABLE public.generated_cvs
  DROP CONSTRAINT IF EXISTS generated_cvs_status_check;

ALTER TABLE public.generated_cvs
  ADD CONSTRAINT generated_cvs_status_check
  CHECK (status IN ('draft', 'generated', 'downloaded', 'pending'));

-- 1c. Cartas de presentación: metadatos de borradores (HU13)
ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS document_title text;

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone
    DEFAULT timezone('utc'::text, now());

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'generated';

ALTER TABLE public.cover_letters
  DROP CONSTRAINT IF EXISTS cover_letters_status_check;

ALTER TABLE public.cover_letters
  ADD CONSTRAINT cover_letters_status_check
  CHECK (status IN ('draft', 'generated', 'downloaded', 'pending'));

-- ──────────────────────────────────────────────────────────────
-- PARTE 2: Función y triggers para updated_at automático
-- ──────────────────────────────────────────────────────────────

-- Función reutilizable
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger en generated_cvs
DROP TRIGGER IF EXISTS set_generated_cvs_updated_at ON public.generated_cvs;

CREATE TRIGGER set_generated_cvs_updated_at
  BEFORE UPDATE ON public.generated_cvs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Trigger en cover_letters
DROP TRIGGER IF EXISTS set_cover_letters_updated_at ON public.cover_letters;

CREATE TRIGGER set_cover_letters_updated_at
  BEFORE UPDATE ON public.cover_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- VERIFICACIÓN: Confirmar columnas creadas
-- ──────────────────────────────────────────────────────────────
SELECT
  table_name,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'generated_cvs', 'cover_letters')
  AND column_name IN ('location', 'document_title', 'status', 'cv_style', 'updated_at')
ORDER BY table_name, column_name;

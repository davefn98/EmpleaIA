-- =========================================================
-- MIGRACION v11: Estado pausado para entrevistas reanudables
-- Ejecutar este bloque en el SQL Editor de Supabase.
--
-- Solo status='paused' debe considerarse reanudable desde el frontend.
-- =========================================================

ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interviews_status_check;

ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_status_check
  CHECK (status IN (
    'active',
    'paused',
    'completed',
    'completed_early',
    'pending_ai_feedback',
    'failed_to_start',
    'abandoned'
  ));

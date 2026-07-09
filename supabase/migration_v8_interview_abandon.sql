-- =========================================================
-- MIGRACIÓN v8: Descarte/abandono robusto de entrevistas
-- Ejecutar este bloque en el SQL Editor de Supabase.
--
-- Contexto: al descartar/abandonar una entrevista, el backend hace DELETE
-- con el cliente scopeado al JWT del usuario (pasa por RLS). Si la política
-- DELETE no existe, PostgREST borra 0 filas SIN devolver error y la
-- entrevista reaparece como "en curso" al recargar. Además, el backend usa
-- ahora un fallback UPDATE a status='abandoned', que el check constraint
-- actual no permite.
-- =========================================================

-- 1. Permitir el estado 'abandoned' en interviews.status
ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interviews_status_check;
ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_status_check
  CHECK (status IN ('active', 'completed', 'completed_early', 'pending_ai_feedback', 'failed_to_start', 'abandoned'));

-- 2. Garantizar política DELETE explícita para interviews.
--    (Idempotente: si ya existe la política "for all", esta política
--    permisiva adicional no cambia el comportamiento.)
DROP POLICY IF EXISTS "Entrevistas: Propietarios pueden eliminar" ON public.interviews;
CREATE POLICY "Entrevistas: Propietarios pueden eliminar" ON public.interviews
    FOR DELETE USING (auth.uid() = profile_id);

-- 3. Garantizar política DELETE explícita para interview_messages.
--    El FK interview_messages.interview_id ya tiene ON DELETE CASCADE, pero
--    esta política cubre borrados directos de mensajes por el propietario.
DROP POLICY IF EXISTS "Mensajes: Propietarios pueden eliminar" ON public.interview_messages;
CREATE POLICY "Mensajes: Propietarios pueden eliminar" ON public.interview_messages
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM public.interviews
        WHERE id = interview_messages.interview_id AND profile_id = auth.uid()
    ));

-- 4. Limpieza opcional: entrevistas 'active' antiguas que quedaron huérfanas
--    por el bug (descartadas en frontend pero nunca borradas). Revisar antes
--    de ejecutar; comentado por defecto.
-- UPDATE public.interviews SET status = 'abandoned'
-- WHERE status = 'active' AND created_at < now() - interval '7 days';

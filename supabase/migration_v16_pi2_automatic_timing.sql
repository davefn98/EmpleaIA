BEGIN;

ALTER TABLE public.pi2_generation_attempts DROP CONSTRAINT IF EXISTS pi2_generation_attempts_document_type_check;
ALTER TABLE public.pi2_generation_attempts ADD CONSTRAINT pi2_generation_attempts_document_type_check
  CHECK (document_type IN ('cv', 'letter', 'profile_import'));

ALTER TABLE public.pi2_task_times
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

CREATE OR REPLACE FUNCTION public.pi2_save_timed_task(
  p_user_id uuid, p_task text, p_method text, p_started_at timestamptz, p_finished_at timestamptz, p_build text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  participant public.pi2_participants%ROWTYPE;
  duration_seconds numeric;
BEGIN
  SELECT * INTO participant FROM public.pi2_participants
    WHERE user_id = auth.uid() AND user_id = p_user_id AND build = p_build;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registra la prueba desde la cuenta y la versión en que te inscribiste.'; END IF;

  duration_seconds := round(EXTRACT(EPOCH FROM (p_finished_at - p_started_at))::numeric, 2);
  IF duration_seconds IS NULL OR duration_seconds <= 0 OR duration_seconds > 86400
    OR p_started_at < participant.enrolled_at - interval '2 minutes'
    OR p_finished_at > now() + interval '2 minutes' THEN
    RAISE EXCEPTION 'El cronómetro no pudo registrar un intervalo válido. Comprueba la hora del dispositivo y repite la tarea.';
  END IF;

  INSERT INTO public.pi2_task_times (participant_code, task, method, seconds, started_at, finished_at)
  VALUES (participant.code, p_task, p_method, duration_seconds, p_started_at, p_finished_at)
  ON CONFLICT (participant_code, task, method) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.pi2_save_timed_task(uuid,text,text,timestamptz,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pi2_save_timed_task(uuid,text,text,timestamptz,timestamptz,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pi2_save_task_time(text,text,numeric,text) FROM authenticated;

COMMIT;

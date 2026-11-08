BEGIN;

CREATE OR REPLACE FUNCTION public.pi2_save_survey(p_kind text, p_score smallint, p_build text, p_interview_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE participant public.pi2_participants%ROWTYPE;
BEGIN
  SELECT * INTO participant FROM public.pi2_participants WHERE user_id = auth.uid() AND build = p_build FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registra la prueba desde la versión en la que te inscribiste.'; END IF;
  IF p_score IS NULL OR p_score NOT BETWEEN 0 AND 10 THEN RAISE EXCEPTION 'Elige un valor de 0 a 10.'; END IF;

  IF p_kind = 'before' AND participant.confidence_before IS NULL THEN
    UPDATE public.pi2_participants SET confidence_before = p_score, confidence_before_at = now() WHERE user_id = auth.uid();
  ELSIF p_kind = 'after' AND participant.confidence_before_at IS NOT NULL AND participant.confidence_after IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.interviews i WHERE i.id = p_interview_id AND i.profile_id = auth.uid()
        AND i.created_at >= participant.confidence_before_at AND i.status IN ('completed', 'completed_early')
    ) THEN RAISE EXCEPTION 'Elige una entrevista que hayas iniciado después de responder y que ya esté finalizada.'; END IF;
    UPDATE public.pi2_participants SET confidence_after = p_score, confidence_after_at = now(), interview_id = p_interview_id WHERE user_id = auth.uid();
  ELSIF p_kind = 'satisfaction' AND participant.satisfaction IS NULL THEN
    IF participant.confidence_after IS NULL OR (
      (SELECT count(DISTINCT document_type) FROM public.pi2_generation_attempts
        WHERE participant_code = participant.code AND build = participant.build AND success AND document_type IN ('cv', 'letter')) <> 2
      AND (SELECT count(*) FROM public.pi2_task_times WHERE participant_code = participant.code AND method = 'platform') <> 3
    ) THEN RAISE EXCEPTION 'Genera un CV y una carta y registra tu respuesta posterior a la entrevista.'; END IF;
    UPDATE public.pi2_participants SET satisfaction = p_score, satisfaction_at = now() WHERE user_id = auth.uid();
  ELSE
    RAISE EXCEPTION 'Esta respuesta ya fue registrada o todavía no corresponde.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pi2_save_survey(text,smallint,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pi2_save_survey(text,smallint,text,uuid) TO authenticated;

COMMIT;

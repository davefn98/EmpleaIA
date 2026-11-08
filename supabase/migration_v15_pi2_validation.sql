BEGIN;

CREATE TABLE IF NOT EXISTS public.pi2_reviewers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION public.pi2_is_reviewer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.pi2_reviewers WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.pi2_is_reviewer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pi2_is_reviewer() TO authenticated;

CREATE TABLE IF NOT EXISTS public.pi2_participants (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  code uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  build text NOT NULL CHECK (char_length(build) BETWEEN 1 AND 100),
  satisfaction smallint CHECK (satisfaction BETWEEN 0 AND 10),
  satisfaction_at timestamptz,
  confidence_before smallint CHECK (confidence_before BETWEEN 0 AND 10),
  confidence_before_at timestamptz,
  confidence_after smallint CHECK (confidence_after BETWEEN 0 AND 10),
  confidence_after_at timestamptz,
  interview_id uuid REFERENCES public.interviews(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.pi2_task_times (
  participant_code uuid NOT NULL REFERENCES public.pi2_participants(code) ON DELETE CASCADE,
  task text NOT NULL CHECK (task IN ('cv', 'letter', 'interview')),
  method text NOT NULL CHECK (method IN ('manual', 'platform')),
  seconds numeric(10,2) NOT NULL CHECK (seconds > 0 AND seconds <= 86400),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_code, task, method)
);

CREATE TABLE IF NOT EXISTS public.pi2_generation_attempts (
  id uuid PRIMARY KEY,
  participant_code uuid NOT NULL REFERENCES public.pi2_participants(code) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('cv', 'letter')),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 0 AND 86400000),
  success boolean NOT NULL,
  regeneration boolean NOT NULL,
  build text NOT NULL CHECK (char_length(build) BETWEEN 1 AND 100),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pi2_project_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator text NOT NULL CHECK (indicator IN ('I1', 'I2', 'I7')),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  reference text NOT NULL DEFAULT '' CHECK (char_length(reference) <= 600),
  completed boolean NOT NULL DEFAULT false,
  CHECK (NOT completed OR char_length(trim(reference)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS pi2_project_evidence_unique_title ON public.pi2_project_evidence (indicator, lower(trim(title)));

-- Inventario inicial del Word de PI2. La revisión y su referencia se registran aparte.
INSERT INTO public.pi2_project_evidence (indicator, title) VALUES
  ('I1', 'Matriz de Vester'),
  ('I1', 'Situación problemática'),
  ('I1', 'Campo de acción'),
  ('I1', 'Objeto de estudio'),
  ('I2', 'Incepción Ágil'),
  ('I2', 'Arquitectura C4 — nivel 1'),
  ('I2', 'Arquitectura C4 — nivel 2'),
  ('I2', 'Arquitectura C4 — nivel 3'),
  ('I2', 'Product Backlog'),
  ('I7', 'Sprint 1'),
  ('I7', 'Sprint 2'),
  ('I7', 'Sprint 3'),
  ('I7', 'Sprint 4')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pi2_quality_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  participant_code uuid NOT NULL REFERENCES public.pi2_participants(code) ON DELETE CASCADE,
  artifact text NOT NULL CHECK (artifact IN ('cv', 'letter', 'feedback')),
  reference text NOT NULL CHECK (char_length(trim(reference)) BETWEEN 1 AND 600),
  scores smallint[] NOT NULL CHECK (
    cardinality(scores) = CASE WHEN artifact = 'feedback' THEN 3 ELSE 5 END
    AND array_position(scores, NULL) IS NULL AND 1 <= ALL(scores) AND 5 >= ALL(scores)
  ),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1500),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pi2_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi2_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi2_task_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi2_generation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi2_project_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pi2_quality_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pi2_reviewers, public.pi2_participants, public.pi2_task_times,
  public.pi2_generation_attempts, public.pi2_project_evidence, public.pi2_quality_reviews FROM anon, authenticated;
GRANT SELECT ON public.pi2_participants, public.pi2_task_times, public.pi2_generation_attempts TO authenticated;
GRANT INSERT (build) ON public.pi2_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pi2_project_evidence TO authenticated;
GRANT SELECT, INSERT ON public.pi2_quality_reviews TO authenticated;

DROP POLICY IF EXISTS pi2_participants_read ON public.pi2_participants;
CREATE POLICY pi2_participants_read ON public.pi2_participants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (SELECT public.pi2_is_reviewer()));
DROP POLICY IF EXISTS pi2_participants_enroll ON public.pi2_participants;
CREATE POLICY pi2_participants_enroll ON public.pi2_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS pi2_task_times_read ON public.pi2_task_times;
CREATE POLICY pi2_task_times_read ON public.pi2_task_times FOR SELECT TO authenticated
  USING ((SELECT public.pi2_is_reviewer()) OR EXISTS (
    SELECT 1 FROM public.pi2_participants p WHERE p.code = participant_code AND p.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS pi2_generation_attempts_read ON public.pi2_generation_attempts;
CREATE POLICY pi2_generation_attempts_read ON public.pi2_generation_attempts FOR SELECT TO authenticated
  USING ((SELECT public.pi2_is_reviewer()) OR EXISTS (
    SELECT 1 FROM public.pi2_participants p WHERE p.code = participant_code AND p.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS pi2_project_evidence_team ON public.pi2_project_evidence;
CREATE POLICY pi2_project_evidence_team ON public.pi2_project_evidence FOR ALL TO authenticated
  USING ((SELECT public.pi2_is_reviewer())) WITH CHECK ((SELECT public.pi2_is_reviewer()));
DROP POLICY IF EXISTS pi2_quality_reviews_team ON public.pi2_quality_reviews;
CREATE POLICY pi2_quality_reviews_team ON public.pi2_quality_reviews FOR ALL TO authenticated
  USING ((SELECT public.pi2_is_reviewer()))
  WITH CHECK ((SELECT public.pi2_is_reviewer()) AND reviewer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.pi2_save_task_time(p_task text, p_method text, p_seconds numeric, p_build text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE participant uuid;
BEGIN
  SELECT code INTO participant FROM public.pi2_participants WHERE user_id = auth.uid() AND build = p_build;
  IF participant IS NULL THEN RAISE EXCEPTION 'Registra la prueba desde la versión en la que te inscribiste.'; END IF;
  INSERT INTO public.pi2_task_times (participant_code, task, method, seconds)
  VALUES (participant, p_task, p_method, p_seconds)
  ON CONFLICT (participant_code, task, method) DO UPDATE
  SET seconds = EXCLUDED.seconds, recorded_at = now();
END;
$$;

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
      SELECT count(*) FROM public.pi2_task_times WHERE participant_code = participant.code AND method = 'platform'
    ) <> 3 THEN RAISE EXCEPTION 'Completa las tres tareas en EmpleaIA y la encuesta posterior a la entrevista.'; END IF;
    UPDATE public.pi2_participants SET satisfaction = p_score, satisfaction_at = now() WHERE user_id = auth.uid();
  ELSE
    RAISE EXCEPTION 'Esta respuesta ya fue registrada o todavía no corresponde.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pi2_record_generation(p_id uuid, p_user_id uuid, p_type text, p_duration_ms integer, p_success boolean, p_regeneration boolean, p_build text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.pi2_generation_attempts (id, participant_code, document_type, duration_ms, success, regeneration, build)
  SELECT p_id, code, p_type, p_duration_ms, p_success, p_regeneration, p_build
  FROM public.pi2_participants WHERE user_id = auth.uid() AND user_id = p_user_id AND build = p_build AND satisfaction IS NULL
  ON CONFLICT (id) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.pi2_save_task_time(text,text,numeric,text), public.pi2_save_survey(text,smallint,text,uuid),
  public.pi2_record_generation(uuid,uuid,text,integer,boolean,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pi2_save_task_time(text,text,numeric,text), public.pi2_save_survey(text,smallint,text,uuid),
  public.pi2_record_generation(uuid,uuid,text,integer,boolean,boolean,text) TO authenticated;

COMMIT;

-- Habilitar a cada evaluador desde SQL Editor, sustituyendo el UUID por el de su cuenta autorizada.
-- INSERT INTO public.pi2_reviewers (user_id) VALUES ('UUID_DEL_EVALUADOR') ON CONFLICT DO NOTHING;

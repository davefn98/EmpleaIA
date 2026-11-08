BEGIN;

ALTER TABLE public.pi2_generation_attempts DROP CONSTRAINT IF EXISTS pi2_generation_attempts_document_type_check;
ALTER TABLE public.pi2_generation_attempts ADD CONSTRAINT pi2_generation_attempts_document_type_check
  CHECK (document_type IN ('cv', 'letter', 'profile_import', 'cv_preparation', 'letter_preparation', 'cv_pdf', 'letter_pdf'));

COMMIT;

-- =============================================================
-- EmpleaIA — MIGRACIÓN v5 (BYOK - Bring Your Own Key)
-- Ejecutar en el SQL Editor de tu proyecto en Supabase Cloud.
-- =============================================================

-- 0. Función de utilidad para set_updated_at si no existe
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Tabla de credenciales de proveedores de IA
CREATE TABLE IF NOT EXISTS public.ai_provider_credentials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini')),
  encrypted_api_key text NOT NULL,
  masked_api_key text NOT NULL,        -- Ej: sk-••••••••1234
  default_model text,
  generation_mode text DEFAULT 'balanced' CHECK (generation_mode IN ('fast', 'balanced', 'detailed')),
  is_active boolean DEFAULT true,
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, provider)            -- Un registro por usuario por proveedor
);

-- Habilitar RLS
ALTER TABLE public.ai_provider_credentials ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas viejas si ya existen
DROP POLICY IF EXISTS "Users can view their own credentials" ON public.ai_provider_credentials;
DROP POLICY IF EXISTS "Users can insert their own credentials" ON public.ai_provider_credentials;
DROP POLICY IF EXISTS "Users can update their own credentials" ON public.ai_provider_credentials;
DROP POLICY IF EXISTS "Users can delete their own credentials" ON public.ai_provider_credentials;

-- Crear políticas de RLS
CREATE POLICY "Users can view their own credentials"
  ON public.ai_provider_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credentials"
  ON public.ai_provider_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credentials"
  ON public.ai_provider_credentials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credentials"
  ON public.ai_provider_credentials FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS set_ai_provider_credentials_updated_at ON public.ai_provider_credentials;
CREATE TRIGGER set_ai_provider_credentials_updated_at
  BEFORE UPDATE ON public.ai_provider_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tabla de preferencias de modelo por módulo
CREATE TABLE IF NOT EXISTS public.ai_model_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  use_case text NOT NULL CHECK (use_case IN ('cv_generation','cover_letter','interview_questions','interview_feedback')),
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, use_case)
);

-- Habilitar RLS
ALTER TABLE public.ai_model_preferences ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas viejas si ya existen
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.ai_model_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.ai_model_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.ai_model_preferences;
DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.ai_model_preferences;

-- Crear políticas de RLS
CREATE POLICY "Users can view their own preferences"
  ON public.ai_model_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.ai_model_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.ai_model_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
  ON public.ai_model_preferences FOR DELETE
  USING (auth.uid() = user_id);

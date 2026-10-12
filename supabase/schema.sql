-- Script DDL de Base de Datos para EmpleaIA
-- Ejecutar en el SQL Editor de tu proyecto en Supabase Cloud.

-- Habilitar la extensión para UUID si no está activa
create extension if not exists "uuid-ossp";

-- 1. TABLA DE PERFILES (Una fila por usuario registrado en Supabase Auth)
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    first_name text not null,
    last_name text not null,
    email text not null,
    phone text,
    career text not null, -- Carrera técnica/universitaria
    target_role text not null, -- Puesto objetivo (ej. Junior Backend Developer)
    target_job_description text, -- Descripcion completa de la vacante objetivo
    bio text,
    technical_skills text[] default '{}'::text[],
    soft_skills text[] default '{}'::text[]
);

-- 2. TABLA DE EDUCACIÓN ACADÉMICA
create table public.academic_background (
    id uuid default gen_random_uuid() primary key,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    institution text not null,
    degree text not null,
    start_date date not null,
    end_date date, -- null indica "Actualmente cursando"
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. TABLA DE EXPERIENCIA LABORAL / PROYECTOS TÉCNICOS
create table public.work_experience (
    id uuid default gen_random_uuid() primary key,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    company text not null,
    role text not null,
    start_date date not null,
    end_date date, -- null indica "Trabajo actual"
    description text not null,
    achievements text[] default '{}'::text[], -- Logros del estudiante
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. TABLA DE CVS GENERADOS POR LA IA
create table public.generated_cvs (
    id uuid default gen_random_uuid() primary key,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    cv_data jsonb not null, -- Almacena la estructura completa del CV redactada en JSON por OpenAI
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. TABLA DE CARTAS DE PRESENTACIÓN GENERADAS
create table public.cover_letters (
    id uuid default gen_random_uuid() primary key,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    job_offer_text text not null, -- La oferta de trabajo pegada por el usuario
    letter_content text not null, -- Contenido de la carta generada
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. TABLA DE SESIONES DE SIMULACIÓN DE ENTREVISTA
create table public.interviews (
    id uuid default gen_random_uuid() primary key,
    profile_id uuid references public.profiles(id) on delete cascade not null,
    interview_type text check (interview_type in ('general', 'technical', 'behavioral')) not null,
    status text check (status in ('in_progress', 'completed')) default 'in_progress' not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. TABLA DE MENSAJES Y EVALUACIONES DE RESPUESTAS DE ENTREVISTA
create table public.interview_messages (
    id uuid default gen_random_uuid() primary key,
    interview_id uuid references public.interviews(id) on delete cascade not null,
    sender text check (sender in ('system', 'ai', 'user')) not null,
    message_content text not null,
    evaluation jsonb, -- Almacena score (0-100), strengths y improvements si el sender es 'user'
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- =========================================================
-- MIGRACIÓN v2: Control de consumo IA por entrevista
-- Ejecutar este bloque en el SQL Editor de Supabase DESPUÉS del DDL inicial
-- =========================================================

-- 1. Expandir estados permitidos (primero eliminar constraint viejo)
ALTER TABLE public.interviews DROP CONSTRAINT IF EXISTS interviews_status_check;
ALTER TABLE public.interviews
  ADD CONSTRAINT interviews_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'completed_early', 'pending_ai_feedback', 'failed_to_start', 'abandoned'));

-- 2. Migrar registros existentes al nuevo nombre de estado
UPDATE public.interviews SET status = 'active' WHERE status = 'in_progress';

-- 3. Columnas de control de IA y sesión
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS total_questions            integer   NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS questions_answered         integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_tokens_used      integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_tokens            integer   NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS ai_provider                text               DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS ai_model                   text               DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS ai_error_type              text,
  ADD COLUMN IF NOT EXISTS profile_summary            text,
  ADD COLUMN IF NOT EXISTS completed_at               timestamp with time zone;

-- 4. Cambiar el valor por defecto del status al nuevo nombre
ALTER TABLE public.interviews ALTER COLUMN status SET DEFAULT 'active';

-- =========================================================
-- MIGRACIÓN v3: Entrevistas con niveles y feedback gestual/voz
-- Ejecutar este bloque en el SQL Editor de Supabase
-- =========================================================
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS difficulty_level           text check (difficulty_level in ('basic', 'intermediate', 'advanced')) default 'intermediate',
  ADD COLUMN IF NOT EXISTS gestural_summary            jsonb default '{}'::jsonb;

-- =========================================================
-- SEGURIDAD: Habilitar Row Level Security (RLS) en las tablas
-- =========================================================
alter table public.profiles enable row level security;
alter table public.academic_background enable row level security;
alter table public.work_experience enable row level security;
alter table public.generated_cvs enable row level security;
alter table public.cover_letters enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_messages enable row level security;

-- POLÍTICAS RLS (Garantiza que el usuario solo opere sobre sus propios registros)
create policy "Perfiles: Propietarios pueden gestionar" on public.profiles 
    for all using (auth.uid() = id);

create policy "Educacion: Propietarios pueden gestionar" on public.academic_background 
    for all using (auth.uid() = profile_id);

create policy "Experiencia: Propietarios pueden gestionar" on public.work_experience 
    for all using (auth.uid() = profile_id);

create policy "CVs: Propietarios pueden gestionar" on public.generated_cvs 
    for all using (auth.uid() = profile_id);

create policy "Cartas: Propietarios pueden gestionar" on public.cover_letters 
    for all using (auth.uid() = profile_id);

create policy "Entrevistas: Propietarios pueden gestionar" on public.interviews 
    for all using (auth.uid() = profile_id);

create policy "Mensajes: Propietarios pueden gestionar" on public.interview_messages 
    for all using (exists (
        select 1 from public.interviews 
        where id = interview_messages.interview_id and profile_id = auth.uid()
    ));

-- =========================================================
-- MIGRACIÓN v4: Campos de metadatos de documentos y ubicación
-- Ejecutar este bloque en el SQL Editor de Supabase
-- =========================================================

-- Columna de ubicación en perfiles (para HU01/HU05)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location text;

-- Columnas de metadatos en CVs generados (para HU13 Borradores)
ALTER TABLE public.generated_cvs
  ADD COLUMN IF NOT EXISTS document_title text,
  ADD COLUMN IF NOT EXISTS cv_style jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

-- Status como columna separada para evitar conflicto con CHECK en ADD COLUMN
ALTER TABLE public.generated_cvs
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'generated';

ALTER TABLE public.generated_cvs
  DROP CONSTRAINT IF EXISTS generated_cvs_status_check;

ALTER TABLE public.generated_cvs
  ADD CONSTRAINT generated_cvs_status_check
  CHECK (status IN ('draft', 'generated', 'downloaded', 'pending'));

-- Columnas de metadatos en cartas de presentación (para HU13 Borradores)
ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS document_title text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());

ALTER TABLE public.cover_letters
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'generated';

ALTER TABLE public.cover_letters
  DROP CONSTRAINT IF EXISTS cover_letters_status_check;

ALTER TABLE public.cover_letters
  ADD CONSTRAINT cover_letters_status_check
  CHECK (status IN ('draft', 'generated', 'downloaded', 'pending'));

-- =========================================================
-- MIGRACIÓN v4b: Trigger para actualizar updated_at automáticamente
-- Ejecutar este bloque en el SQL Editor de Supabase
-- =========================================================

-- Función reutilizable para auto-actualizar updated_at
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


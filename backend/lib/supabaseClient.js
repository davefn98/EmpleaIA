import './loadEnv.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Advertencia: Faltan variables de entorno de Supabase en backend/.env');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Cliente admin: bypasea RLS. Solo para operaciones de backend que DEBEN
// garantizar un cambio de estado (ej. cerrar entrevistas).
// La service_role key NUNCA se expone al frontend.
if (!serviceRoleKey) {
  console.warn(
    '[supabaseClient] ⚠️  SUPABASE_SERVICE_ROLE_KEY no está configurada en backend/.env.\n' +
    '  El cierre de entrevistas usará el cliente scopeado al JWT del usuario (fallback).\n' +
    '  En producción, configura la service role key para garantizar el cambio de estado.'
  );
}

export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl || '', serviceRoleKey)
  : null;

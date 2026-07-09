// Verifica qué columnas de generated_cvs existen realmente en la BD (vía PostgREST).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'D:/Personal/Proyectos/IA Empleabilidad/backend/.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { error: signInError } = await supabase.auth.signInWithPassword({
  email: 'test@estudiante.edu.pe',
  password: 'password123',
});
if (signInError) { console.error(signInError.message); process.exit(1); }

for (const col of ['id', 'profile_id', 'cv_data', 'created_at', 'document_title', 'cv_style', 'status', 'updated_at']) {
  const { error } = await supabase.from('generated_cvs').select(col).limit(1);
  console.log(col.padEnd(16), error ? `NO -> ${error.code}: ${error.message}` : 'OK');
}

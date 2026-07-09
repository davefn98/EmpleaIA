// Elimina CVs de prueba creados durante diagnóstico (usuario test@estudiante.edu.pe).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'D:/Personal/Proyectos/IA Empleabilidad/backend/.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: signIn, error } = await supabase.auth.signInWithPassword({
  email: 'test@estudiante.edu.pe',
  password: 'password123',
});
if (error) { console.error(error.message); process.exit(1); }

const ids = process.argv.slice(2);
for (const id of ids) {
  const { error: delError } = await supabase.from('generated_cvs').delete().eq('id', id);
  console.log(id, delError ? `ERROR: ${delError.message}` : 'eliminado');
}

// Reproduce el 500 de POST /api/cv-generate con el usuario de prueba.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'D:/Personal/Proyectos/IA Empleabilidad/backend/.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PORT = process.argv[2] || '5000';

const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
  email: 'test@estudiante.edu.pe',
  password: 'password123',
});
if (signInError) {
  console.error('No se pudo iniciar sesión:', signInError.message);
  process.exit(1);
}
const token = signIn.session.access_token;
const userId = signIn.user.id;
console.log('Sesión OK. UID:', userId);

const themeConfig = {
  template: 'executive',
  fontFamily: 'inter',
  primaryColor: 'wine',
  fontSize: 'normal',
  spacing: 'compact',
  headerStyle: 'centered',
};

const res = await fetch(`http://localhost:${PORT}/api/cv-generate`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ profileId: userId, cv_style: themeConfig }),
});

console.log('Status:', res.status);
const text = await res.text();
console.log('Body:', text.slice(0, 2000));

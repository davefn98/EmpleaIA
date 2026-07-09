import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const envPath = 'd:/Personal/Proyectos/IA Empleabilidad/backend/.env';
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const email = 'test@estudiante.edu.pe';
  const password = 'password123';

  console.log('1. intentando registrar/iniciar sesión para:', email);
  let userId;
  
  // Registrar usuario
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password
  });

  if (signUpError) {
    console.log('Error de registro (puede que ya exista):', signUpError.message);
    
    // Si ya existe, iniciar sesión
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (signInError) {
      console.error('Error al iniciar sesión:', signInError.message);
      return;
    }
    userId = signInData.user.id;
    console.log('Sesión iniciada con éxito. UID:', userId);
  } else {
    userId = signUpData.user.id;
    console.log('Usuario registrado con éxito. UID:', userId);
  }

  // Actualizar perfil con campos y habilidades requeridas
  console.log('2. Actualizando perfil en profiles...');
  
  // Primero ver si existe la fila
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  const profilePayload = {
    id: userId,
    first_name: 'Juan',
    last_name: 'Pérez',
    email: email,
    career: 'Computación e Informática',
    target_role: 'Junior Frontend Developer',
    bio: 'Estudiante técnico de Computación e Informática aspirando a desempeñarse como Junior Frontend Developer.',
    technical_skills: ['React', 'JavaScript', 'HTML', 'CSS'],
    soft_skills: ['Comunicación', 'Liderazgo', 'Trabajo en equipo']
  };

  let profileError;
  if (existingProfile) {
    const { error } = await supabase
      .from('profiles')
      .update(profilePayload)
      .eq('id', userId);
    profileError = error;
  } else {
    const { error } = await supabase
      .from('profiles')
      .insert(profilePayload);
    profileError = error;
  }

  if (profileError) {
    console.error('Error insertando/actualizando perfil:', profileError);
  } else {
    console.log('Perfil insertado/actualizado con éxito en la base de datos.');
  }
}

main();

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

const envPath = './.env';
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const email = 'test@estudiante.edu.pe';
  const password = 'password123';

  console.log('Logging in user:', email);
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (signInError) {
    console.error('Error logging in:', signInError.message);
    return;
  }

  const token = signInData.session.access_token;
  const userId = signInData.user.id;
  console.log('Logged in successfully. User ID:', userId);

  console.log('\nSending POST request to /api/letter-generate...');
  try {
    const response = await fetch('http://localhost:5000/api/letter-generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        profileId: userId,
        company: 'Microsoft',
        targetRole: 'Developer Senior',
        jobDescription: 'Buscamos un desarrollador backend experimentado.',
        tone: 'formal'
      })
    });

    const result = await response.json();
    console.log('Response Status:', response.status);
    console.log('Response Body:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error making API request:', err.message);
  }
}

main();

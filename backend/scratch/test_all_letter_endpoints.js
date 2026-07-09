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

  console.log('\n--- 1. Testing POST /api/letter-generate ---');
  try {
    const response = await fetch('http://localhost:5000/api/letter-generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        profileId: userId,
        company: 'Microsoft Test LLC',
        targetRole: 'Senior QA Engineer',
        jobDescription: 'Buscamos un Ingeniero de QA Senior experimentado.',
        tone: 'formal'
      })
    });

    const result = await response.json();
    console.log('Generate Status:', response.status);
    console.log('Generate Response keys:', Object.keys(result));
    console.log('Generate success:', result.success);
    console.log('Generate warning:', result.warning);
    console.log('Generate saveErrorCode:', result.saveErrorCode);
    console.log('Generate letterContent sample:', result.letterContent?.slice(0, 100));

    if (result.success && result.letterContent) {
      console.log('\n--- 2. Testing Fallback POST /api/letter-save ---');
      const saveResponse = await fetch('http://localhost:5000/api/letter-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          profileId: userId,
          jobOfferText: 'Empresa: Microsoft Test LLC\nPuesto: Senior QA Engineer',
          letterContent: result.letterContent,
          documentTitle: 'Borrador Guardado Manualmente',
          status: 'draft',
          company: 'Microsoft Test LLC',
          targetRole: 'Senior QA Engineer',
          jobDescription: 'Buscamos un Ingeniero de QA Senior experimentado.',
          tone: 'formal'
        })
      });

      const saveResult = await saveResponse.json();
      console.log('Save Status:', saveResponse.status);
      console.log('Save Response:', JSON.stringify(saveResult, null, 2));
    }

  } catch (err) {
    console.error('Error making API requests:', err.message);
  }
}

main();

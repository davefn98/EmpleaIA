import dotenv from 'dotenv';
import fetch from 'node-fetch';

const envPath = './.env';
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  const url = `${supabaseUrl}/rest/v1/`;
  console.log('Fetching PostgREST OpenAPI schema from:', url);
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    const coverLettersDef = data.definitions?.cover_letters;
    if (coverLettersDef) {
      console.log('cover_letters columns properties:', JSON.stringify(coverLettersDef.properties, null, 2));
    } else {
      console.log('cover_letters definition not found. Available tables:', Object.keys(data.definitions || {}));
    }
  } catch (err) {
    console.error('Error fetching schema:', err);
  }
}

main();

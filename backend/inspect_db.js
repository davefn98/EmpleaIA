import './lib/loadEnv.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('URL:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('Error selecting from profiles:', error);
  } else {
    console.log('Success! Sample row keys:', data && data.length > 0 ? Object.keys(data[0]) : 'No rows found');
    console.log('Full first row:', data && data.length > 0 ? data[0] : 'None');
  }
}

main();

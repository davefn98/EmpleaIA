import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const envPath = './.env';
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Testing insert into cover_letters with new columns...");
  const { data: clData, error: clError } = await supabase
    .from('cover_letters')
    .insert({
      profile_id: '00000000-0000-0000-0000-000000000000',
      job_offer_text: 'Test job offer',
      letter_content: 'Test content',
      document_title: 'Test Title',
      status: 'generated'
    });

  if (clError) {
    console.log('Cover letters error code:', clError.code);
    console.log('Cover letters error details:', clError.message, clError.details);
  } else {
    console.log('Cover letters insert succeeded unexpectedly:', clData);
  }

  console.log("\nTesting insert into generated_cvs with new columns...");
  const { data: cvData, error: cvError } = await supabase
    .from('generated_cvs')
    .insert({
      profile_id: '00000000-0000-0000-0000-000000000000',
      cv_data: {},
      document_title: 'Test Title',
      status: 'generated',
      cv_style: {}
    });

  if (cvError) {
    console.log('Generated CVs error code:', cvError.code);
    console.log('Generated CVs error details:', cvError.message, cvError.details);
  } else {
    console.log('Generated CVs insert succeeded unexpectedly:', cvData);
  }
}

main();

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('Signing in...');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'test@estudiante.edu.pe',
    password: 'password123'
  });

  if (signInError) {
    console.error('Error signing in:', signInError.message);
    return;
  }

  const userId = signInData.user.id;
  console.log('Signed in. UID:', userId);

  console.log('Querying profiles...');
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .limit(1);

  if (pErr) {
    console.error('Error fetching profiles:', pErr);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.log('No profiles found in database.');
    return;
  }

  const realProfileId = profiles[0].id;
  console.log('Using real profile ID:', realProfileId);

  console.log('Querying interviews rows...');
  const { data: interviews, error: err } = await supabase
    .from('interviews')
    .select('*')
    .eq('profile_id', realProfileId)
    .limit(10);

  if (err) {
    console.error('Error fetching interviews:', err);
  } else {
    console.log('Interviews found:', interviews.length);
    interviews.forEach(i => {
      console.log(`ID: ${i.id}, status: ${i.status}, created_at: ${i.created_at}, questions_answered: ${i.questions_answered}`);
    });
  }

  console.log('Checking if user can insert and delete an "active" interview...');
  const testId = '22222222-2222-2222-2222-222222222222';
  const { data: insertData, error: insertErr } = await supabase
    .from('interviews')
    .insert({
      id: testId,
      profile_id: realProfileId,
      interview_type: 'technical',
      status: 'active'
    })
    .select();

  if (insertErr) {
    console.log('Insert test with status "active" failed:', insertErr.message, insertErr.code);
  } else {
    console.log('Insert test with status "active" SUCCEEDED! Now trying to delete it...');
    const { data: deleteData, error: deleteErr } = await supabase
      .from('interviews')
      .delete()
      .eq('id', testId)
      .select();

    if (deleteErr) {
      console.log('Delete failed:', deleteErr.message);
    } else {
      console.log('Delete result data:', deleteData);
      if (deleteData && deleteData.length > 0) {
        console.log('Delete SUCCEEDED! Row was deleted.');
      } else {
        console.log('Delete returned 0 rows! RLS is blocking DELETE.');
      }
    }
  }
}

main();

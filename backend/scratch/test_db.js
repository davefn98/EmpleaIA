import { supabase } from '../lib/supabaseClient.js';

async function test() {
  console.log('Consultando tabla ai_provider_credentials...');
  const { data, error } = await supabase
    .from('ai_provider_credentials')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error al consultar tabla:', error);
  } else {
    console.log('Tabla consultada con éxito (existe):', data);
  }
}

test();

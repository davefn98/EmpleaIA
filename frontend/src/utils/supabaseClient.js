import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL no está configurada');
}

if (supabaseUrl.includes('/rest/v1')) {
  throw new Error(
    'VITE_SUPABASE_URL debe contener la URL base del proyecto, sin /rest/v1'
  );
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY no está configurada');
}

export const PASSWORD_RESET_PATH = '/reset-password';
// Mantiene la clave predeterminada de Supabase para conservar las sesiones existentes.
const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: authStorageKey, detectSessionInUrl: window.location.pathname !== PASSWORD_RESET_PATH },
});

export async function clearClosedAccountSession() {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (!error) return;
  } catch {
    // Si falla el cierre local por red, la cuenta ya fue eliminada en el servidor.
  }
  localStorage.removeItem(authStorageKey);
  localStorage.removeItem(`${authStorageKey}-user`);
  localStorage.removeItem(`${authStorageKey}-code-verifier`);
}

export function createPasswordRecoveryClient() {
  // Keep the temporary recovery session separate from the app's sign-in session.
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'empleaia-password-recovery',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: (url, params) =>
        url.pathname === PASSWORD_RESET_PATH && params.type === 'recovery' && Boolean(params.access_token),
    },
  });
}

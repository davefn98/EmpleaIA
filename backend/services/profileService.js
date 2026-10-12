import { supabaseAdmin } from '../lib/supabaseClient.js';

/**
 * Asegura la existencia del perfil de un usuario.
 * Si no existe, intenta crearlo lazy a partir de los metadatos de Supabase Auth
 * usando el cliente administrativo de forma temporal y controlada.
 *
 * Contrato de retorno:
 * - { success: true, profile: object, source: 'db' | 'lazy_created' }
 * - { success: false, code: string, error: string }
 */
export async function ensureUserProfile(userId, req) {
  if (req.fakeProfileResult) {
    return req.fakeProfileResult;
  }
  const db = req.db;

  // 1. Intentar consultar el perfil desde la base de datos
  const { data: profile, error: dbError } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (dbError) {
    console.error(`[profileService] Error de base de datos consultando perfil para ${userId}:`, dbError.message);
    return {
      success: false,
      code: 'DB_ERROR',
      error: 'Error de base de datos al recuperar el perfil.'
    };
  }

  if (profile) {
    return { success: true, profile, source: 'db' };
  }

  // 2. Si no existe, activar la creación lazy temporal de seguridad
  console.warn(`[profileService] ⚠️ Perfil inexistente para el usuario autenticado ${userId}. Ejecutando creación lazy temporal.`);
  const adminClient = req.supabaseAdminOverride || supabaseAdmin;
  if (!adminClient) {
    console.error('[profileService] ❌ No se pudo ejecutar la creación lazy: falta la SUPABASE_SERVICE_ROLE_KEY en el servidor.');
    return {
      success: false,
      code: 'MISSING_ADMIN_KEY',
      error: 'No se pudo inicializar la creación de perfil: falta configuración administrativa.'
    };
  }

  // 3. Consultar los metadatos del usuario desde Supabase Auth Admin
  const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId);

  if (authError || !authUser?.user) {
    console.error(`[profileService] Error obteniendo metadatos de Auth para ${userId}:`, authError?.message);
    return {
      success: false,
      code: 'AUTH_ADMIN_FAILED',
      error: 'No se pudieron recuperar los metadatos de registro del usuario de Supabase Auth.'
    };
  }

  const meta = authUser.user.user_metadata || {};
  let firstName = (meta.first_name || meta.firstName || '').trim();
  let lastName = (meta.last_name || meta.lastName || '').trim();
  const fullName = (meta.full_name || meta.fullName || '').trim();

  // Dividir full_name si first_name está vacío
  if (!firstName && fullName) {
    const parts = fullName.split(' ');
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  const email = (authUser.user.email || '').trim();
  const career = (meta.career || '').trim();
  const targetRole = (meta.target_role || '').trim();

  // 4. Insertar la fila de perfil básica de forma segura (concurrencia y RLS bypass)
  const { data: newProfile, error: insertError } = await adminClient
    .from('profiles')
    .insert({
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      career,
      target_role: targetRole,
    })
    .select()
    .single();

  if (insertError) {
    // Controlar concurrencia: código de error 23505 (unique_violation)
    if (insertError.code === '23505') {
      console.warn(`[profileService] Conflicto de inserción concurrente para ${userId} resuelto. Leyendo perfil insertado.`);
      const { data: retryProfile, error: retryError } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!retryError && retryProfile) {
        return { success: true, profile: retryProfile, source: 'db' };
      }
    }

    console.error(`[profileService] Error al insertar perfil lazy para ${userId}:`, insertError.message);
    return {
      success: false,
      code: 'PROFILE_INSERT_FAILED',
      error: 'No se pudo guardar la información de tu perfil en la base de datos.'
    };
  }

  return { success: true, profile: newProfile, source: 'lazy_created' };
}

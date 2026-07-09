/**
 * letterRepository.js — Acceso a datos del módulo de cartas de presentación.
 *
 * Encapsula todas las consultas a Supabase relacionadas con cover_letters,
 * profiles, academic_background y work_experience.
 *
 * Todas las funciones reciben `db` (req.db), el cliente Supabase autenticado
 * con el token del usuario, para que las políticas RLS se apliquen siempre.
 * Este módulo no contiene lógica de negocio ni conoce req/res.
 */

/**
 * Clasifica un error de Supabase en un código de error de aplicación.
 * Centraliza la lógica de interpretación de códigos de error de Postgres/PostgREST.
 *
 * @param {object} supabaseError
 * @returns {string}
 */
function classifySaveError(supabaseError) {
  if (!supabaseError) return 'LETTER_SAVE_FAILED';
  const { code, message } = supabaseError;
  if (code === '42703' || message?.includes('column') || code === 'PGRST204') {
    return 'DB_SCHEMA_MISMATCH';
  }
  if (code === '23503' || message?.includes('profile_id')) {
    return 'PROFILE_REQUIRED';
  }
  return 'LETTER_SAVE_FAILED';
}

/**
 * Obtiene el perfil de un usuario por su ID.
 *
 * @param {object} db       - Cliente Supabase autenticado (req.db)
 * @param {string} profileId
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function getProfile(db, profileId) {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();
  return { data, error };
}

/**
 * Obtiene la formación académica asociada a un perfil.
 *
 * @param {object} db
 * @param {string} profileId
 * @returns {Promise<object[]>}
 */
export async function getAcademicBackground(db, profileId) {
  const { data } = await db
    .from('academic_background')
    .select('*')
    .eq('profile_id', profileId);
  return data || [];
}

/**
 * Obtiene la experiencia laboral asociada a un perfil.
 *
 * @param {object} db
 * @param {string} profileId
 * @returns {Promise<object[]>}
 */
export async function getWorkExperience(db, profileId) {
  const { data } = await db
    .from('work_experience')
    .select('*')
    .eq('profile_id', profileId);
  return data || [];
}

/**
 * Inserta una carta de presentación en la tabla cover_letters.
 * Devuelve también un `errorCode` de aplicación cuando falla, para que el
 * servicio pueda tomar decisiones sin inspeccionar códigos de Postgres.
 *
 * @param {object} db
 * @param {object} payload - Campos a insertar
 * @returns {Promise<{ data: object|null, error: object|null, errorCode: string|null }>}
 */
export async function insertLetter(db, payload) {
  const { data, error } = await db
    .from('cover_letters')
    .insert(payload)
    .select()
    .single();
  return {
    data,
    error,
    errorCode: error ? classifySaveError(error) : null,
  };
}

/**
 * Elimina una carta de presentación. La condición `profile_id = userId`
 * garantiza que cada usuario solo elimine sus propias cartas incluso si RLS
 * estuviera desactivado (defensa en profundidad).
 *
 * @param {object} db
 * @param {string} id     - ID de la carta (cover_letters.id)
 * @param {string} userId - ID del usuario autenticado (req.user.id)
 * @returns {Promise<{ error: object|null }>}
 */
export async function deleteLetter(db, id, userId) {
  const { error } = await db
    .from('cover_letters')
    .delete()
    .eq('id', id)
    .eq('profile_id', userId);
  return { error };
}

/**
 * Actualiza campos de una carta de presentación del usuario autenticado.
 *
 * @param {object} db
 * @param {string} id      - ID de la carta
 * @param {string} userId  - ID del usuario autenticado
 * @param {object} payload - Campos a actualizar
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function updateLetter(db, id, userId, payload) {
  const { data, error } = await db
    .from('cover_letters')
    .update(payload)
    .eq('id', id)
    .eq('profile_id', userId)
    .select()
    .single();
  return { data, error };
}

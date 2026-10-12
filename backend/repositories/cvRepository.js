/**
 * cvRepository.js — Acceso a datos del módulo de CVs.
 *
 * Encapsula todas las consultas a Supabase relacionadas con generated_cvs,
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
  if (!supabaseError) return 'CV_SAVE_FAILED';
  const { code, message } = supabaseError;
  if (code === '42703' || message?.includes('column') || code === 'PGRST204') {
    return 'DB_SCHEMA_MISMATCH';
  }
  if (code === '23503' || message?.includes('profile_id')) {
    return 'PROFILE_REQUIRED';
  }
  return 'CV_SAVE_FAILED';
}

/**
 * Obtiene el perfil de un usuario por su ID.
 *
 * @param {object} db        - Cliente Supabase autenticado (req.db)
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
  const { data, error } = await db
    .from('academic_background')
    .select('*')
    .eq('profile_id', profileId);
  if (error) throw error;
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
  const { data, error } = await db
    .from('work_experience')
    .select('*')
    .eq('profile_id', profileId);
  if (error) throw error;
  return data || [];
}

/**
 * Inserta un CV en la tabla generated_cvs.
 * Devuelve también un `errorCode` de aplicación cuando falla, para que el
 * servicio pueda tomar decisiones sin inspeccionar códigos de Postgres.
 *
 * @param {object} db
 * @param {object} payload - Campos a insertar
 * @returns {Promise<{ data: object|null, error: object|null, errorCode: string|null }>}
 */
export async function insertCv(db, payload) {
  const { data, error } = await db
    .from('generated_cvs')
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
 * Elimina un CV. La condición `profile_id = userId` garantiza que cada usuario
 * solo elimine sus propios CVs incluso si RLS estuviera desactivado
 * (defensa en profundidad).
 *
 * @param {object} db
 * @param {string} id     - ID del CV (generated_cvs.id)
 * @param {string} userId - ID del usuario autenticado (req.user.id)
 * @returns {Promise<{ error: object|null }>}
 */
export async function deleteCv(db, id, userId) {
  const { error } = await db
    .from('generated_cvs')
    .delete()
    .eq('id', id)
    .eq('profile_id', userId);
  return { error };
}

/**
 * Actualiza campos de un CV del usuario autenticado.
 *
 * @param {object} db
 * @param {string} id      - ID del CV
 * @param {string} userId  - ID del usuario autenticado
 * @param {object} payload - Campos a actualizar
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function updateCv(db, id, userId, payload) {
  const { data, error } = await db
    .from('generated_cvs')
    .update(payload)
    .eq('id', id)
    .eq('profile_id', userId)
    .select()
    .single();
  return { data, error };
}

/**
 * Actualiza los campos de perfil extraídos por el parser de CV.
 *
 * @param {object} db
 * @param {string} profileId
 * @param {object} data - Campos a actualizar en la tabla profiles
 * @returns {Promise<{ error: object|null }>}
 */
export async function updateProfile(db, profileId, data) {
  const { error } = await db
    .from('profiles')
    .update(data)
    .eq('id', profileId);
  return { error };
}

/**
 * Elimina toda la formación académica del perfil y la reemplaza con los
 * registros provistos. Operación destructiva; se ejecuta solo si hay registros.
 *
 * @param {object}   db
 * @param {string}   profileId
 * @param {object[]} records   - Registros extraídos por el parser
 * @returns {Promise<{ error: object|null }>}
 */
export async function replaceAcademicBackground(db, profileId, records) {
  const { error: deleteError } = await db
    .from('academic_background')
    .delete()
    .eq('profile_id', profileId);
  if (deleteError) return { error: deleteError };

  const inserts = records.map((a) => ({
    profile_id:  profileId,
    institution: a.institution,
    degree:      a.degree,
    period:      a.period,
  }));
  const { error: insertError } = await db
    .from('academic_background')
    .insert(inserts);
  return { error: insertError };
}

/**
 * Elimina toda la experiencia laboral del perfil y la reemplaza con los
 * registros provistos. Operación destructiva; se ejecuta solo si hay registros.
 *
 * @param {object}   db
 * @param {string}   profileId
 * @param {object[]} records   - Registros extraídos por el parser
 * @returns {Promise<{ error: object|null }>}
 */
export async function replaceWorkExperience(db, profileId, records) {
  const { error: deleteError } = await db
    .from('work_experience')
    .delete()
    .eq('profile_id', profileId);
  if (deleteError) return { error: deleteError };

  const inserts = records.map((w) => ({
    profile_id:  profileId,
    company:     w.company,
    role:        w.role,
    start_date:  w.start_date || '2024',
    end_date:    w.end_date || 'Actual',
    description: w.description || '',
  }));
  const { error: insertError } = await db
    .from('work_experience')
    .insert(inserts);
  return { error: insertError };
}

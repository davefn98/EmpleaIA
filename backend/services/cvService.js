/**
 * cvService.js — Lógica de negocio del módulo de CVs.
 *
 * Orquesta la generación de IA, los fallbacks honestos y las operaciones CRUD
 * delegando la persistencia a cvRepository.
 *
 * Regla de integridad de datos: los fallbacks usan ÚNICAMENTE datos reales del
 * usuario o campos vacíos ("" / []) cuando el dato no existe. Prohibido asignar
 * valores genéricos inventados (nombres de carrera, listas de skills por defecto,
 * roles de trabajo asumidos, etc.).
 *
 * Este módulo no conoce req/res ni códigos HTTP: recibe datos, devuelve datos
 * o lanza errores con `.status` y `.code` para que el controlador los traduzca.
 */

import { SYSTEM_PROMPT_CV, SYSTEM_PROMPT_CV_PARSE } from '../lib/prompts.js';
import { generateWithFallback }                      from '../lib/AIProviderService.js';
import * as cvRepo                                   from '../repositories/cvRepository.js';

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

/**
 * Crea un error de aplicación tipado con status HTTP y código de negocio.
 *
 * @param {string} message
 * @param {number} status
 * @param {string} [code]
 * @returns {Error}
 */
function appError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

/**
 * Fallback honesto para cv-generate cuando la IA no está disponible.
 *
 * Estructura el CV únicamente con la información real que el usuario ya
 * ingresó. No se inventan logros, métricas, empresas, instituciones ni
 * habilidades — eso pondría datos falsos en un CV real.
 *
 * @param {object} profile       - Registro de la tabla profiles
 * @param {object} userInputData - Objeto consolidado con academic/work del usuario
 * @returns {object}             - Objeto cvJson con la misma forma que la IA devuelve
 */
function buildFallbackCv(profile, userInputData) {
  const careerName = userInputData.personal_info?.career || profile.career || '';
  const roleName   = userInputData.personal_info?.target_role || profile.target_role || '';

  return {
    professional_summary:
      userInputData.personal_info?.bio ||
      profile.bio ||
      [
        careerName && `Egresado de ${careerName}`,
        roleName   && `orientado a desempeñarse como ${roleName}`,
      ]
        .filter(Boolean)
        .join(', ') + '.',
    work_experience: (userInputData.work_experience || []).map((w) => ({
      company:            w.company || '',
      role:               w.role || '',
      period:             w.period || [w.start_date, w.end_date].filter(Boolean).join(' - '),
      impact_description: w.description || '',
      achievements:       Array.isArray(w.achievements) ? w.achievements : [],
    })),
    academic_background: (userInputData.academic_background || []).map((a) => ({
      institution: a.institution || '',
      degree:      a.degree || '',
      period:      a.period || [a.start_date, a.end_date].filter(Boolean).join(' - '),
      relevance:   a.description || '',
    })),
    skills_categories: {
      languages_and_frameworks:    userInputData.skills?.technical || profile.technical_skills || [],
      tools_and_databases:         [],
      methodologies_and_soft_skills: userInputData.skills?.soft || profile.soft_skills || [],
    },
  };
}

/**
 * Fallback honesto para cv-parse cuando la IA no está disponible.
 *
 * Extrae datos del texto del CV usando expresiones regulares. Cuando un campo
 * no puede extraerse del texto real del CV queda vacío ("" o []) — nunca se
 * asigna un valor genérico inventado como "Computación e Informática" o listas
 * de habilidades por defecto.
 *
 * La detección por keywords (p. ej. "redes" → "Redes y Seguridad de TI") es una
 * heurística que sí parte del texto del usuario. El inicio vacío ("") garantiza
 * que, si ningún keyword coincide, el campo quede en blanco en lugar de tener
 * un valor fabricado.
 *
 * Exportada para permitir su test unitario en aislamiento.
 *
 * @param {string} cvText
 * @returns {object}
 */
export function buildFallbackParsedData(cvText) {
  const textLower = cvText.toLowerCase();

  // Intentar extraer nombre de la primera línea no vacía
  let first_name = '';
  let last_name  = '';
  const lines = cvText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 0) {
    const nameParts = lines[0].split(' ');
    if (nameParts.length >= 2) {
      first_name = nameParts[0];
      last_name  = nameParts.slice(1).join(' ');
    } else {
      first_name = nameParts[0];
    }
  }

  // Buscar email
  const emailMatch = cvText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // Buscar teléfono
  const phoneMatch = cvText.match(/(?:\+?\d{1,3}[- ]?)?\d{9,10}/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  // Carrera: detectada por keywords del texto; vacía si ninguno coincide (sin valor por defecto inventado)
  let career = '';
  if (textLower.includes('redes'))           career = 'Redes y Seguridad de TI';
  else if (textLower.includes('diseño'))     career = 'Diseño y Desarrollo de Software';
  else if (textLower.includes('industrial')) career = 'Electrónica Industrial';
  else if (textLower.includes('sistemas'))   career = 'Ingeniería de Sistemas';

  // Puesto objetivo: detectado por keywords; vacío si ninguno coincide (sin valor por defecto inventado)
  let target_role = '';
  if (textLower.includes('frontend'))                                          target_role = 'Junior Frontend Developer';
  else if (textLower.includes('backend'))                                      target_role = 'Junior Backend Developer';
  else if (textLower.includes('fullstack') || textLower.includes('full stack')) target_role = 'Junior Full Stack Developer';
  else if (textLower.includes('soporte') || textLower.includes('técnico'))     target_role = 'Soporte Técnico de TI';

  // Habilidades técnicas: solo las encontradas en el texto — array vacío si no hay ninguna
  const techKeywords = [
    'react', 'node', 'javascript', 'python', 'html', 'css', 'sql',
    'postgresql', 'git', 'supabase', 'docker', 'angular', 'vue',
    'java', 'c#', 'php',
  ];
  const technical_skills = [];
  techKeywords.forEach((kw) => {
    if (textLower.includes(kw)) {
      const cap =
        kw === 'sql' || kw === 'html' || kw === 'css'
          ? kw.toUpperCase()
          : kw.charAt(0).toUpperCase() + kw.slice(1);
      technical_skills.push(cap);
    }
  });
  // Sin lista por defecto: si el texto no menciona ningún skill, el array queda vacío.

  // Habilidades blandas: solo las encontradas en el texto — array vacío si no hay ninguna
  const softKeywords = [
    'scrum', 'comunicación', 'equipo', 'proactivo', 'liderazgo',
    'organización', 'empatía', 'resolución', 'presión',
  ];
  const soft_skills = [];
  softKeywords.forEach((kw) => {
    if (textLower.includes(kw)) {
      const cap = kw.charAt(0).toUpperCase() + kw.slice(1);
      soft_skills.push(cap);
    }
  });
  // Sin lista por defecto: si el texto no menciona ninguna habilidad, el array queda vacío.

  // Bio: construida solo con los datos extraídos; vacía si no se extrajo career ni target_role
  const bioSegments = [
    career      ? `Egresado de ${career}` : null,
    target_role ? `orientado a desempeñarse como ${target_role}` : null,
  ].filter(Boolean);
  const bio = bioSegments.length > 0 ? bioSegments.join(' ') + '.' : '';

  return {
    first_name: first_name || '',
    last_name:  last_name  || '',
    email:      email      || '',
    phone:      phone      || '',
    career,
    target_role,
    bio,
    technical_skills,
    soft_skills,
    work_experience:     [],
    academic_background: [],
  };
}

// ---------------------------------------------------------------------------
// Funciones exportadas
// ---------------------------------------------------------------------------

/**
 * Genera un CV con IA y lo persiste en la base de datos.
 *
 * Si la IA falla, usa el fallback honesto (datos reales del usuario).
 * Si la persistencia falla por columnas de metadatos faltantes (migración
 * pendiente), reintenta sin esas columnas; si aun así falla, lanza un error
 * 500 tipado con mensaje claro para el cliente.
 *
 * @param {object} params
 * @param {object} params.db             - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId         - ID del usuario autenticado (req.user.id)
 * @param {string} params.profileId
 * @param {string} [params.document_title]
 * @param {string} [params.status]
 * @param {string} [params.cv_style]
 * @returns {Promise<{ cvId: string, cvData: object }>}
 */
export async function generateCv({ 
  db, 
  userId, 
  profileId, 
  document_title, 
  status, 
  cv_style,
  custom_target_role,
  cv_focus,
  excluded_experience_ids,
  excluded_skills,
}) {
  // 1. Obtener perfil
  const { data: profile, error: profileError } = await cvRepo.getProfile(db, profileId);
  if (profileError || !profile) {
    console.error('[cvService] Error recuperando perfil:', profileError);
    throw appError('Perfil no encontrado en la base de datos', 404, 'PROFILE_NOT_FOUND');
  }

  // 2. Obtener formación académica y experiencia laboral en paralelo
  const [academic, work] = await Promise.all([
    cvRepo.getAcademicBackground(db, profileId),
    cvRepo.getWorkExperience(db, profileId),
  ]);

  // 3. Consolidar la información estructurada aplicando filtros
  const userInputData = {
    personal_info: {
      first_name:  profile.first_name,
      last_name:   profile.last_name,
      email:       profile.email,
      phone:       profile.phone,
      career:      profile.career,
      target_role: custom_target_role || profile.target_role,
      bio:         profile.bio,
      cv_focus:    cv_focus || 'ATS',
    },
    skills: {
      technical: (profile.technical_skills || []).filter(s => !(excluded_skills || []).includes(s)),
      soft:      (profile.soft_skills || []).filter(s => !(excluded_skills || []).includes(s)),
    },
    academic_background: academic,
    work_experience:     work.filter(w => !(excluded_experience_ids || []).includes(w.id)),
  };

  // 4. Invocar a la IA; fallback honesto si la IA no está disponible
  let cvJson;
  try {
    const focusLabel = cv_focus || 'ATS';
    const focusDescription = focusLabel === 'técnico' ? 'técnico (resaltando stacks, arquitecturas, metodologías)'
      : focusLabel === 'ejecutivo' ? 'ejecutivo (resaltando liderazgo, gestión de proyectos, visión estratégica)'
      : focusLabel === 'junior' ? 'junior (resaltando aprendizaje rápido, proyectos académicos, adaptabilidad)'
      : focusLabel === 'senior' ? 'senior (resaltando impacto cuantificable, mentoría, toma de decisiones)'
      : 'ATS estándar de alto impacto';

    const cvJsonText = await generateWithFallback({
      useCase:   'cv_generation',
      messages:  [
        { role: 'system', content: SYSTEM_PROMPT_CV },
        { role: 'user',   content: `Datos estructurados del candidato:\n${JSON.stringify(userInputData)}\n\nPor favor, genera y redacta el CV adaptando el resumen profesional y la descripción de logros/proyectos para tener un enfoque: ${focusDescription}.` },
      ],
      db,
      userId,
      jsonMode:  true,
      maxTokens: 1500,
    });
    cvJson = JSON.parse(cvJsonText);
  } catch (apiError) {
    console.warn(
      '⚠️ Error en generación de CV por IA. Usando SOLO los datos reales del perfil como respaldo. Detalle:',
      apiError.message
    );
    cvJson = buildFallbackCv(profile, userInputData);
  }

  // 5. Guardar en la base de datos.
  // Si el esquema real no tiene alguna columna de metadatos (migración
  // supabase/migration_fix_all.sql pendiente), se reintenta sin esa columna
  // para no bloquear la generación: el CV se guarda con los campos que sí
  // existen. profile_id y cv_data son parte del esquema base y nunca se omiten.
  const defaultTitle = `CV ${profile.first_name || 'Egresado'} - ${profile.target_role || profile.career || 'TI'}`;
  const insertPayload = {
    profile_id:     profileId,
    cv_data:        cvJson,
    document_title: document_title || defaultTitle,
    status:         status    || 'generated',
    cv_style:       cv_style  || null,
  };
  const REQUIRED_COLUMNS = ['profile_id', 'cv_data'];

  let savedCv   = null;
  let lastError = null;
  const maxAttempts = Object.keys(insertPayload).length - REQUIRED_COLUMNS.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error, errorCode } = await cvRepo.insertCv(db, insertPayload);
    if (!error) {
      savedCv = data;
      break;
    }
    lastError = error;

    // PGRST204: "Could not find the 'X' column..." / 42703: "column t.X does not exist"
    const missingColumn = errorCode === 'DB_SCHEMA_MISMATCH'
      ? (error.message?.match(/'([^']+)' column/)?.[1] ||
         error.message?.match(/column (?:\w+\.)?"?(\w+)"? does not exist/)?.[1])
      : null;

    if (missingColumn && !REQUIRED_COLUMNS.includes(missingColumn) && missingColumn in insertPayload) {
      console.warn(
        `[cvService] La columna '${missingColumn}' no existe en generated_cvs. ` +
        `Se reintenta el guardado sin ella. Ejecuta supabase/migration_fix_all.sql en Supabase para actualizar el esquema.`
      );
      delete insertPayload[missingColumn];
      continue;
    }
    break;
  }

  if (!savedCv) {
    console.error('[cvService] Error guardando el CV en Supabase:', lastError);
    const isSchemaError = lastError?.code === 'PGRST204' || lastError?.code === '42703';
    throw appError(
      isSchemaError
        ? 'No se pudo guardar el CV: el esquema de la base de datos está desactualizado. Ejecuta la migración supabase/migration_fix_all.sql.'
        : 'No se pudo guardar el CV en la base de datos.',
      500,
      isSchemaError ? 'DB_SCHEMA_MISMATCH' : 'CV_SAVE_FAILED'
    );
  }

  return { cvId: savedCv.id, cvData: cvJson };
}

/**
 * Parsea el texto de un CV con IA y actualiza el perfil del usuario.
 *
 * Si la IA falla, usa el extractor de regex local. Los fallos de persistencia
 * (perfil, academic_background, work_experience) se loguean pero no bloquean
 * la respuesta: el usuario recibe siempre los datos parseados.
 *
 * @param {object} params
 * @param {object} params.db        - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId    - ID del usuario autenticado (req.user.id)
 * @param {string} params.profileId
 * @param {string} params.cvText
 * @returns {Promise<{ parsedData: object }>}
 */
export async function parseCv({ db, userId, profileId, cvText }) {
  // 1. Invocar a la IA; fallback de regex si la IA no está disponible
  const { parsedData } = await parseCvRaw({ db, userId, cvText });

  // 2. Actualizar perfil (fallo suave: se loguea pero no bloquea la respuesta)
  //
  // Solo se envían al UPDATE los campos que tienen un valor real extraído.
  // Si un campo quedó vacío ("" o []) no lo escribimos para evitar pisar datos
  // reales que el usuario ya tenía en su perfil con valores en blanco.
  const profileUpdate = {};
  if (parsedData.first_name)                    profileUpdate.first_name       = parsedData.first_name;
  if (parsedData.last_name)                     profileUpdate.last_name        = parsedData.last_name;
  if (parsedData.phone)                         profileUpdate.phone            = parsedData.phone;
  if (parsedData.career)                        profileUpdate.career           = parsedData.career;
  if (parsedData.target_role)                   profileUpdate.target_role      = parsedData.target_role;
  if (parsedData.bio)                           profileUpdate.bio              = parsedData.bio;
  if (parsedData.technical_skills?.length > 0) profileUpdate.technical_skills = parsedData.technical_skills;
  if (parsedData.soft_skills?.length > 0)      profileUpdate.soft_skills      = parsedData.soft_skills;

  if (Object.keys(profileUpdate).length > 0) {
    const { error: profileUpdateError } = await cvRepo.updateProfile(db, profileId, profileUpdate);
    if (profileUpdateError) {
      console.error('Error actualizando perfil con datos del parser:', profileUpdateError);
    }
  }

  // 3. Reemplazar formación académica si el parser extrajo registros
  if (parsedData.academic_background && parsedData.academic_background.length > 0) {
    const { error: acadError } = await cvRepo.replaceAcademicBackground(
      db,
      profileId,
      parsedData.academic_background
    );
    if (acadError) {
      console.warn('[cvService] Advertencia: no se pudo actualizar la formación académica:', acadError);
    }
  }

  // 4. Reemplazar experiencia laboral si el parser extrajo registros
  if (parsedData.work_experience && parsedData.work_experience.length > 0) {
    const { error: workError } = await cvRepo.replaceWorkExperience(
      db,
      profileId,
      parsedData.work_experience
    );
    if (workError) {
      console.warn('[cvService] Advertencia: no se pudo actualizar la experiencia laboral:', workError);
    }
  }

  return { parsedData };
}

/**
 * Extrae los datos estructurados de un CV en texto libre con IA, SIN persistir
 * nada en el perfil del usuario. Se usa para autocompletar el wizard de CV:
 * el usuario decide después si guarda o descarta los datos.
 *
 * @param {object} params
 * @param {object} params.db      - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId  - ID del usuario autenticado (req.user.id)
 * @param {string} params.cvText
 * @returns {Promise<{ parsedData: object }>}
 */
export async function parseCvRaw({ db, userId, cvText }) {
  let parsedData;
  try {
    const parsedJsonText = await generateWithFallback({
      useCase:   'cv_generation',
      messages:  [
        { role: 'system', content: SYSTEM_PROMPT_CV_PARSE },
        { role: 'user',   content: cvText },
      ],
      db,
      userId,
      jsonMode:  true,
      maxTokens: 1500,
    });
    parsedData = JSON.parse(parsedJsonText);
  } catch (apiError) {
    console.warn(
      '⚠️ Advertencia: Error en parser de OpenAI, activando Extractor de Regex Local. Detalles:',
      apiError.message
    );
    parsedData = buildFallbackParsedData(cvText);
  }

  return { parsedData };
}

/**
 * Elimina un CV del usuario autenticado.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.id      - ID del CV (generated_cvs.id)
 * @param {string} params.userId  - ID del usuario autenticado (req.user.id)
 * @returns {Promise<void>}
 */
export async function deleteUserCv({ db, id, userId }) {
  const { error } = await cvRepo.deleteCv(db, id, userId);
  if (error) {
    console.error('[cvService] Error al eliminar CV:', error);
    throw appError('Error al eliminar el CV en la base de datos', 500);
  }
}

/**
 * Actualiza campos editables de un CV del usuario autenticado.
 * Solo actualiza los campos que llegan definidos en `fields`.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.id
 * @param {string} params.userId
 * @param {object} params.fields
 * @param {string} [params.fields.status]
 * @param {string} [params.fields.document_title]
 * @param {string} [params.fields.cv_style]
 * @param {object} [params.fields.cv_data]
 * @returns {Promise<{ cv: object }>}
 */
export async function updateUserCv({ db, id, userId, fields }) {
  const updatePayload = {};
  if (fields.status         !== undefined) updatePayload.status         = fields.status;
  if (fields.document_title !== undefined) updatePayload.document_title = fields.document_title;
  if (fields.cv_style       !== undefined) updatePayload.cv_style       = fields.cv_style;
  if (fields.cv_data        !== undefined) updatePayload.cv_data        = fields.cv_data;
  updatePayload.updated_at = new Date().toISOString();

  const { data: updatedCv, error } = await cvRepo.updateCv(db, id, userId, updatePayload);

  if (error) {
    console.error('[cvService] Error al actualizar CV:', error);
    throw appError('Error al actualizar el CV.', 400, 'CV_UPDATE_FAILED');
  }

  return { cv: updatedCv };
}

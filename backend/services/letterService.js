/**
 * letterService.js — Lógica de negocio del módulo de cartas de presentación.
 *
 * Orquesta la generación de IA, el fallback honesto y las operaciones CRUD
 * delegando la persistencia a letterRepository.
 *
 * Este módulo no conoce req/res ni códigos HTTP: recibe datos, devuelve datos
 * o lanza errores con `.status` y `.code` para que el controlador los traduzca.
 */

import { SYSTEM_PROMPT_LETTER } from '../lib/prompts.js';
import { generateWithFallback }  from '../lib/AIProviderService.js';
import * as letterRepo           from '../repositories/letterRepository.js';

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

/**
 * Normaliza el texto de la oferta laboral que se enviará al prompt de IA.
 * Si ya llega `jobOfferText` se usa tal cual; si no, se construye a partir de
 * los campos individuales (company, targetRole, jobDescription, tone).
 */
function buildJobOfferText({ jobOfferText, company, targetRole, jobDescription, tone }) {
  if (jobOfferText) return jobOfferText;
  return [
    `Empresa: ${company || 'No especificada'}`,
    `Puesto Objetivo: ${targetRole || 'No especificado'}`,
    `Descripción de la Vacante: ${jobDescription}`,
    `Tono deseado: ${tone || 'profesional'}`,
  ].join('\n');
}

/**
 * Construye el resumen del candidato para el prompt de IA usando EXCLUSIVAMENTE
 * datos reales del perfil. No se inventa ni interpola ningún dato ausente.
 */
function buildUserSummary(profile, academic, work) {
  return [
    `Nombre: ${profile.first_name} ${profile.last_name}`,
    `Carrera: ${profile.career}`,
    `Puesto objetivo: ${profile.target_role}`,
    `Biografía: ${profile.bio || 'No especificada'}`,
    `Habilidades Técnicas: ${(profile.technical_skills || []).join(', ')}`,
    `Habilidades Blandas: ${(profile.soft_skills || []).join(', ')}`,
    `Educación: ${academic.map((a) => `${a.degree} en ${a.institution}`).join('; ')}`,
    `Experiencia: ${work.map((w) => `${w.role} en ${w.company}`).join('; ')}`,
  ].join('\n');
}

/**
 * Fallback honesto cuando la IA no está disponible.
 *
 * Genera una carta con estructura neutral usando SOLO datos reales del perfil.
 * Prohibido inventar logros, empresas, métricas o educación no declarada.
 *
 * @param {object} profile
 * @param {{ company?: string, targetRole?: string }} opts
 * @returns {string}
 */
function buildFallbackLetter(profile, { company, targetRole }) {
  const fullName    = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  const careerName  = profile.career || '';
  const roleName    = targetRole || profile.target_role || '';
  const companyName = company || '';
  const techSkills  =
    profile.technical_skills && profile.technical_skills.length > 0
      ? profile.technical_skills.join(', ')
      : '';

  const lines = [
    `Estimado Equipo de Selección${companyName ? ` de ${companyName}` : ''},`,
    '',
    `Me dirijo a ustedes para presentar mi candidatura${roleName ? ` al puesto de ${roleName}` : ''}${careerName ? `, como egresado de ${careerName}` : ''}.`,
    '',
    ...(profile.bio ? [profile.bio, ''] : []),
    ...(techSkills ? [`Entre mis conocimientos técnicos se encuentran: ${techSkills}.`, ''] : []),
    'Me interesa la oportunidad de conversar sobre cómo mi perfil puede aportar a su equipo. Quedo a su disposición para una entrevista.',
    '',
    'Atentamente,',
    '',
    fullName,
    ...(profile.email ? [profile.email] : []),
  ];

  return lines.join('\n');
}

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

// ---------------------------------------------------------------------------
// Funciones exportadas
// ---------------------------------------------------------------------------

/**
 * Genera una carta de presentación con IA y la persiste en la base de datos.
 *
 * Resiliencia de persistencia: si la IA genera la carta pero el INSERT falla,
 * se devuelve la carta con un warning en lugar de lanzar un error, para que
 * el usuario no pierda el contenido generado.
 *
 * @param {object} params
 * @param {object} params.db            - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId        - ID del usuario autenticado (req.user.id)
 * @param {string} params.profileId
 * @param {string} [params.jobOfferText]
 * @param {string} [params.company]
 * @param {string} [params.targetRole]
 * @param {string} [params.jobDescription]
 * @param {string} [params.tone]
 * @param {string} [params.document_title]
 * @param {string} [params.status]
 * @returns {Promise<{
 *   letterId: string|null,
 *   letterContent: string,
 *   warning?: string,
 *   saveErrorCode?: string
 * }>}
 */
export async function generateLetter({
  db,
  userId,
  profileId,
  jobOfferText,
  company,
  targetRole,
  jobDescription,
  tone,
  document_title,
  status,
}) {
  // 1. Obtener perfil
  const { data: profile, error: profileError } = await letterRepo.getProfile(db, profileId);
  if (profileError || !profile) {
    console.error('[letterService] Error recuperando perfil para carta:', profileError);
    throw appError(
      'No se encontró un perfil profesional para guardar la carta.',
      400,
      'PROFILE_REQUIRED'
    );
  }

  // 2. Obtener formación académica y experiencia laboral en paralelo
  const [academic, work] = await Promise.all([
    letterRepo.getAcademicBackground(db, profileId),
    letterRepo.getWorkExperience(db, profileId),
  ]);

  // 3. Normalizar texto de oferta laboral
  const finalJobOfferText = buildJobOfferText({ jobOfferText, company, targetRole, jobDescription, tone });

  // 4. Construir resumen del candidato (solo datos reales)
  const userSummary = buildUserSummary(profile, academic, work);

  // 5. Invocar a la IA; fallback honesto si la IA no está disponible
  let letterContent;
  try {
    letterContent = await generateWithFallback({
      useCase: 'cover_letter',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_LETTER },
        {
          role: 'user',
          content:
            `Perfil del candidato:\n${userSummary}\n\nOferta Laboral a la que postula:\n${finalJobOfferText}` +
            (tone ? `\n\nPor favor, redacta la carta con un tono ${tone}.` : ''),
        },
      ],
      db,
      userId,
      maxTokens: 700,
    });
  } catch (apiError) {
    console.warn(
      '[letterService] Error en generación de carta por IA. Usando plantilla honesta con datos reales del perfil. Detalle:',
      apiError.message
    );
    letterContent = buildFallbackLetter(profile, { company, targetRole });
  }

  // 6. Persistir la carta generada
  const defaultTitle = `Carta para ${company || targetRole || profile.target_role || 'Vacante'}`;
  const insertPayload = {
    profile_id:      profileId,
    job_offer_text:  finalJobOfferText,
    letter_content:  letterContent,
    document_title:  document_title || defaultTitle,
    status:          status || 'generated',
    company:         company || null,
    target_role:     targetRole || null,
    job_description: jobDescription || null,
    tone:            tone || null,
  };

  const { data: savedLetter, error: saveError, errorCode } = await letterRepo.insertLetter(
    db,
    insertPayload
  );

  if (saveError) {
    console.error('[letterService] Error guardando la carta en Supabase:', {
      table:   'cover_letters',
      columns: Object.keys(insertPayload),
      code:    saveError.code,
      message: saveError.message,
      details: saveError.details,
      hint:    saveError.hint,
    });
    // Resiliencia: devolver la carta generada con warning para que el usuario no la pierda
    return {
      letterId:      null,
      letterContent,
      warning:       'La carta fue generada, pero no pudo guardarse en la base de datos.',
      saveErrorCode: errorCode,
    };
  }

  return { letterId: savedLetter.id, letterContent };
}

/**
 * Guarda manualmente una carta (sin generación de IA).
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.profileId
 * @param {string} [params.jobOfferText]
 * @param {string} [params.letterContent]
 * @param {string} [params.documentTitle]
 * @param {string} [params.status]
 * @param {string} [params.company]
 * @param {string} [params.targetRole]
 * @param {string} [params.jobDescription]
 * @param {string} [params.tone]
 * @returns {Promise<{ letterId: string }>}
 */
export async function saveLetterManually({
  db,
  profileId,
  jobOfferText,
  letterContent,
  documentTitle,
  status,
  company,
  targetRole,
  jobDescription,
  tone,
}) {
  const defaultTitle = `Carta para ${company || targetRole || 'Vacante'}`;
  const insertPayload = {
    profile_id:      profileId,
    job_offer_text:  jobOfferText || '',
    letter_content:  letterContent,
    document_title:  documentTitle || defaultTitle,
    status:          status || 'generated',
    company:         company || null,
    target_role:     targetRole || null,
    job_description: jobDescription || null,
    tone:            tone || null,
  };

  const { data: savedLetter, error: saveError, errorCode } = await letterRepo.insertLetter(
    db,
    insertPayload
  );

  if (saveError) {
    console.error('[letterService] Error guardando la carta manualmente:', {
      code:    saveError.code,
      message: saveError.message,
    });
    throw appError(
      'No se pudo guardar la carta en base de datos.',
      500,
      errorCode || 'LETTER_SAVE_FAILED'
    );
  }

  return { letterId: savedLetter.id };
}

/**
 * Elimina una carta de presentación del usuario autenticado.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.id      - ID de la carta (cover_letters.id)
 * @param {string} params.userId  - ID del usuario autenticado (req.user.id)
 * @returns {Promise<void>}
 */
export async function deleteUserLetter({ db, id, userId }) {
  const { error } = await letterRepo.deleteLetter(db, id, userId);
  if (error) {
    console.error('[letterService] Error al eliminar carta:', error);
    throw appError('Error al eliminar la carta de presentación en la base de datos.', 500);
  }
}

/**
 * Actualiza campos de una carta de presentación del usuario autenticado.
 * Solo actualiza los campos que llegan definidos en `fields`.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.id
 * @param {string} params.userId
 * @param {object} params.fields              - Campos a actualizar
 * @param {string} [params.fields.status]
 * @param {string} [params.fields.document_title]
 * @param {string} [params.fields.letter_content]
 * @returns {Promise<{ letter: object }>}
 */
export async function updateUserLetter({ db, id, userId, fields }) {
  const updatePayload = {};
  if (fields.status         !== undefined) updatePayload.status         = fields.status;
  if (fields.document_title !== undefined) updatePayload.document_title = fields.document_title;
  if (fields.letter_content !== undefined) updatePayload.letter_content = fields.letter_content;
  updatePayload.updated_at = new Date().toISOString();

  const { data: updatedLetter, error } = await letterRepo.updateLetter(db, id, userId, updatePayload);

  if (error) {
    console.error('[letterService] Error al actualizar carta:', error);
    throw appError('Error al actualizar la carta de presentación.', 400);
  }

  return { letter: updatedLetter };
}

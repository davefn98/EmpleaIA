/**
 * routes/letter.js — Controlador delgado del módulo de cartas de presentación.
 *
 * Responsabilidades únicas de esta capa:
 *   1. Registrar los endpoints en Express.
 *   2. Aplicar middlewares (autenticación).
 *   3. Validar la entrada con los esquemas zod de letterValidator.
 *   4. Llamar al servicio correspondiente.
 *   5. Responder con el helper apiResponse (ok / fail).
 *
 * Sin SQL, sin lógica de negocio, sin llamadas directas a IA.
 */

import { Router } from 'express';
import { requireAuth }  from '../lib/authMiddleware.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ok, fail }     from '../lib/apiResponse.js';
import {
  letterGenerateSchema,
  letterUpdateSchema,
  letterSaveSchema,
} from '../validators/letterValidator.js';
import * as letterService from '../services/letterService.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/letter-generate
// Genera una carta de presentación con IA y la persiste.
// El rate limit para este endpoint se aplica en server.js (aiLimiter).
// ---------------------------------------------------------------------------
router.post('/letter-generate', requireAuth, asyncHandler(async (req, res) => {
  // Validación de entrada
  const parsed = letterGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    const failedPaths = parsed.error.errors.map((e) => e.path[0]);
    if (failedPaths.includes('profileId')) {
      return fail(res, 'No se encontró un perfil profesional para guardar la carta.', 400, 'PROFILE_REQUIRED');
    }
    return fail(res, 'Faltan parámetros requeridos (jobOfferText o jobDescription)', 400, 'BAD_REQUEST');
  }

  const { profileId, jobOfferText, company, targetRole, jobDescription, tone, document_title, status } =
    parsed.data;

  // Llamada al servicio; errores de negocio conocidos (< 500) se capturan aquí.
  // Errores inesperados (500) se propagan vía asyncHandler al middleware global.
  let result;
  try {
    result = await letterService.generateLetter({
      db: req.db,
      userId: req.user.id,
      profileId,
      jobOfferText,
      company,
      targetRole,
      jobDescription,
      tone,
      document_title,
      status,
    });
  } catch (err) {
    if (err.status && err.status < 500) {
      return fail(res, err.message, err.status, err.code);
    }
    throw err;
  }

  // Respuesta — misma forma que el handler original, usando ok() para el body
  return ok(res, {
    letterId:      result.letterId,
    letterContent: result.letterContent,
    ...(result.warning
      ? { warning: result.warning, saveErrorCode: result.saveErrorCode }
      : {}),
  });
}));

// ---------------------------------------------------------------------------
// DELETE /api/letter/:id
// Elimina una carta del usuario autenticado.
// ---------------------------------------------------------------------------
router.delete('/letter/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  await letterService.deleteUserLetter({ db: req.db, id, userId: req.user.id });

  return ok(res, { message: 'Carta de presentación eliminada correctamente' });
}));

// ---------------------------------------------------------------------------
// PUT /api/letter/:id
// Actualiza campos editables de una carta existente.
// ---------------------------------------------------------------------------
router.put('/letter/:id', requireAuth, asyncHandler(async (req, res) => {
  const parsedBody = letterUpdateSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return fail(res, 'Datos de actualización inválidos.', 400, 'VALIDATION_ERROR');
  }

  const { id } = req.params;

  let result;
  try {
    result = await letterService.updateUserLetter({
      db:     req.db,
      id,
      userId: req.user.id,
      fields: parsedBody.data,
    });
  } catch (err) {
    if (err.status && err.status < 500) {
      return fail(res, err.message, err.status, err.code);
    }
    throw err;
  }

  return ok(res, { letter: result.letter });
}));

// ---------------------------------------------------------------------------
// POST /api/letter-save
// Guarda manualmente una carta (sin generación de IA).
// ---------------------------------------------------------------------------
router.post('/letter-save', requireAuth, asyncHandler(async (req, res) => {
  const parsed = letterSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'No se encontró un perfil profesional para guardar la carta.', 400, 'PROFILE_REQUIRED');
  }

  const { profileId, jobOfferText, letterContent, documentTitle, status, company, targetRole, jobDescription, tone } =
    parsed.data;

  let result;
  try {
    result = await letterService.saveLetterManually({
      db: req.db,
      profileId,
      jobOfferText,
      letterContent,
      documentTitle,
      status,
      company,
      targetRole,
      jobDescription,
      tone,
    });
  } catch (err) {
    if (err.status && err.status < 500) {
      return fail(res, err.message, err.status, err.code);
    }
    // 500: devuelve código de negocio si está disponible, mensaje genérico seguro
    return fail(res, 'No se pudo guardar la carta en base de datos.', 500, err.code || 'LETTER_SAVE_FAILED');
  }

  return ok(res, {
    letterId: result.letterId,
    message:  'Carta de presentación guardada con éxito.',
  });
}));

export default router;

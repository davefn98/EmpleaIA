/**
 * routes/cv.js — Controlador delgado del módulo de CVs.
 *
 * Responsabilidades únicas de esta capa:
 *   1. Registrar los endpoints en Express.
 *   2. Aplicar middlewares (autenticación).
 *   3. Validar la entrada con los esquemas zod de cvValidator.
 *   4. Llamar al servicio correspondiente.
 *   5. Responder con el helper apiResponse (ok / fail).
 *
 * Sin SQL, sin lógica de negocio, sin llamadas directas a IA.
 */

import { Router } from 'express';
import multer from 'multer';
import { requireAuth }  from '../lib/authMiddleware.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ok, fail }     from '../lib/apiResponse.js';
import { extractCvText } from '../lib/fileTextExtractor.js';
import {
  cvGenerateSchema,
  cvParseSchema,
  cvUpdateSchema,
} from '../validators/cvValidator.js';
import * as cvService from '../services/cvService.js';

const router = Router();

// Upload en memoria para la importación de CV (PDF/DOCX/TXT, máx 5 MB)
const allowedCvMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/octet-stream'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = (file.originalname || '').split('.').pop().toLowerCase();
    const validExtension = ['pdf', 'docx', 'txt'].includes(extension);
    const validMime = allowedCvMimeTypes.has(file.mimetype);

    if (validExtension && validMime) return cb(null, true);

    const err = new Error('Formato de archivo no soportado. Solo se permiten archivos PDF, DOCX o TXT.');
    err.code = 'UNSUPPORTED_FORMAT';
    return cb(err);
  }
});

// Convierte el error de tamaño de multer en una respuesta controlada
const handleUploadErrors = (middleware) => (req, res, next) => {
  middleware(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return fail(res, 'El archivo supera el límite de 5 MB.', 400, 'FILE_TOO_LARGE');
    }
    if (err?.code === 'UNSUPPORTED_FORMAT') {
      return fail(res, err.message, 400, 'UNSUPPORTED_FORMAT');
    }
    if (err) return next(err);
    next();
  });
};

// ---------------------------------------------------------------------------
// POST /api/cv-generate
// Genera un CV con IA (o fallback honesto) y lo persiste.
// El rate limit para este endpoint se aplica en server.js (aiLimiter).
// ---------------------------------------------------------------------------
router.post('/cv-generate', requireAuth, asyncHandler(async (req, res) => {
  const parsed = cvGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    const failedPaths = parsed.error.errors.map((e) => e.path[0]);
    console.warn('[cv-generate] Validación fallida en campos:', failedPaths.join(', '));
    if (failedPaths.includes('profileId')) {
      return fail(res, 'Falta el parámetro profileId', 400, 'PROFILE_ID_REQUIRED');
    }
    return fail(res, `Datos de entrada inválidos (campos: ${failedPaths.join(', ')})`, 400, 'BAD_REQUEST');
  }

  const { 
    profileId, 
    document_title, 
    status, 
    cv_style,
    custom_target_role,
    cv_focus,
    excluded_experience_ids,
    excluded_skills,
    candidate_data,
    target_job_description,
  } = parsed.data;

  // Errores de aplicación tipados (con .status) devuelven su mensaje real al
  // cliente, incluidos los 500 controlados (ej. fallo de guardado): el mensaje
  // de appError es seguro y accionable. Solo los errores inesperados sin tipo
  // se propagan vía asyncHandler al middleware global (mensaje genérico).
  let result;
  try {
    result = await cvService.generateCv({
      db:     req.db,
      userId: req.user.id,
      profileId,
      document_title,
      status,
      cv_style,
      custom_target_role,
      cv_focus,
      excluded_experience_ids,
      excluded_skills,
      candidate_data,
      target_job_description,
    });
  } catch (err) {
    if (err.status) {
      console.error('[cv-generate] Error controlado:', err.code || '', err.message);
      return fail(res, err.message, err.status, err.code);
    }
    throw err;
  }

  return ok(res, { cvId: result.cvId, cvData: result.cvData });
}));

// ---------------------------------------------------------------------------
// POST /api/cv-parse
// Extrae datos de un CV en texto libre con IA y actualiza el perfil.
// El rate limit para este endpoint se aplica en server.js (aiLimiter).
// ---------------------------------------------------------------------------
router.post('/cv-parse', requireAuth, asyncHandler(async (req, res) => {
  const parsed = cvParseSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Faltan parámetros requeridos (profileId, cvText)', 400, 'BAD_REQUEST');
  }

  const { profileId, cvText } = parsed.data;

  // El servicio no lanza errores de negocio < 500: los fallos de persistencia
  // son soft-fails internos. Los errores inesperados llegan al middleware global.
  const result = await cvService.parseCv({
    db:     req.db,
    userId: req.user.id,
    profileId,
    cvText,
  });

  return ok(res, { parsedData: result.parsedData });
}));

// ---------------------------------------------------------------------------
// POST /api/cv/parse-import
// Extrae datos de un CV subido como archivo (PDF/DOCX/TXT) o pegado como texto
// y devuelve los datos estructurados SIN persistir nada en el perfil.
// El rate limit para este endpoint se aplica en server.js (aiLimiter).
// ---------------------------------------------------------------------------
router.post('/cv/parse-import', requireAuth, handleUploadErrors(upload.single('file')), asyncHandler(async (req, res) => {
  const pastedText = typeof req.body?.cvText === 'string' ? req.body.cvText.trim() : '';

  if (!req.file && !pastedText) {
    return fail(res, 'Adjunta un archivo (PDF, DOCX o TXT) o pega el texto de tu CV.', 400, 'BAD_REQUEST');
  }

  let cvText;
  try {
    cvText = req.file ? await extractCvText(req.file) : pastedText;
  } catch (err) {
    if (err.status) {
      console.warn('[cv/parse-import] Extracción fallida:', err.code, err.message);
      return fail(res, err.message, err.status, err.code);
    }
    throw err;
  }

  if (cvText.trim().length <= 100) {
    return fail(res, 'El texto del CV es demasiado corto para extraer datos (mínimo ~100 caracteres).', 400, 'TEXT_TOO_SHORT');
  }

  const result = await cvService.parseCvRaw({
    db:     req.db,
    userId: req.user.id,
    cvText,
  });

  return ok(res, { parsedData: result.parsedData });
}));

// ---------------------------------------------------------------------------
// DELETE /api/cv/:id
// Elimina un CV del usuario autenticado.
// ---------------------------------------------------------------------------
router.delete('/cv/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  await cvService.deleteUserCv({ db: req.db, id, userId: req.user.id });

  return ok(res, { message: 'CV eliminado correctamente' });
}));

// ---------------------------------------------------------------------------
// PUT /api/cv/:id
// Actualiza campos editables de un CV existente.
// ---------------------------------------------------------------------------
router.put('/cv/:id', requireAuth, asyncHandler(async (req, res) => {
  const parsedBody = cvUpdateSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return fail(res, 'Datos de actualización inválidos.', 400, 'VALIDATION_ERROR');
  }

  const { id } = req.params;
  const { status, document_title, cv_style, cv_data } = parsedBody.data;

  let result;
  try {
    result = await cvService.updateUserCv({
      db:     req.db,
      id,
      userId: req.user.id,
      fields: { status, document_title, cv_style, cv_data },
    });
  } catch (err) {
    if (err.status && err.status < 500) {
      return fail(res, err.message, err.status, err.code);
    }
    throw err;
  }

  return ok(res, { cv: result.cv });
}));

export default router;

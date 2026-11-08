import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/authMiddleware.js';
import { parseCvRaw } from '../services/cvService.js';
import { importedCvToProfile } from '../services/cvImportData.js';
import { extractCvText } from '../lib/fileTextExtractor.js';
import { cvProfileItemSchema, fullProfileUpdateSchema } from '../validators/profileValidator.js';
import { saveCvSkillToProfile, saveCvStudyToProfile } from '../services/cvProfileItemService.js';

const router = Router();

// Configuración de Multer para recibir archivos en memoria (límite de 5 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// Importación para revisión: comparte extracción, contrato y comprobaciones con CV.
const importUpload = (req, res, next) => upload.single('file')(req, res, (error) => {
  if (error) return res.status(400).json({ success: false, code: error.code,
    error: error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el límite de 5 MB.' : 'No se pudo recibir el archivo.' });
  next();
});

router.post('/profile/import-cv', requireAuth, importUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, code: 'BAD_REQUEST', error: 'Adjunta un CV en PDF, DOCX o TXT.' });
    const cvText = await extractCvText(req.file);
    const { parsedData } = await parseCvRaw({ db: req.db, userId: req.user.id, cvText });
    return res.json({ success: true, data: importedCvToProfile(parsedData) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'CV_IMPORT_FAILED',
      error: error.status ? error.message : 'No se pudo importar el CV. No se guardó ningún dato.' });
  }
});

router.post('/profile/import-text', requireAuth, async (req, res) => {
  const cvText = req.body?.cvText;
  if (typeof cvText !== 'string' || cvText.trim().length < 50) {
    return res.status(400).json({ success: false, code: 'TEXT_TOO_SHORT', error: 'Pega el texto completo de tu perfil (mínimo 50 caracteres).' });
  }
  try {
    const { parsedData } = await parseCvRaw({ db: req.db, userId: req.user.id, cvText });
    return res.json({ success: true, data: importedCvToProfile(parsedData) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, code: error.code || 'CV_IMPORT_FAILED',
      error: error.status ? error.message : 'No se pudo importar el texto. No se guardó ningún dato.' });
  }
});

// GET /profile/:userId
router.get('/profile/:userId', requireAuth, async (req, res) => {
  console.log('[BACKEND GET /profile/:userId] Params:', req.params);
  try {
    const { userId } = req.params;
    const supabaseClient = req.db;

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.warn('[BACKEND GET /profile/:userId] Perfil no encontrado:', error);
      return res.status(404).json({ error: 'Perfil no encontrado en la base de datos' });
    }

    return res.json({ success: true, profile });
  } catch (error) {
    console.error('[BACKEND GET /profile/:userId] Error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /profile/:userId
router.put('/profile/:userId', requireAuth, async (req, res) => {
  console.log('[BACKEND PUT /profile/:userId] Actualizando perfil:', req.params.userId);
  try {
    const { userId } = req.params;
    const supabaseClient = req.db;

    // Actualización PARCIAL: solo las columnas enviadas. Usamos update (no upsert)
    // para no forzar un INSERT que violaría los NOT NULL de las columnas omitidas.
    const profilePayload = {
      ...req.body,
      updated_at: new Date().toISOString()
    };
    delete profilePayload.id; // el id no se modifica

    const { data: updatedProfile, error } = await supabaseClient
      .from('profiles')
      .update(profilePayload)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[BACKEND PUT /profile/:userId] Error actualizando perfil:', error);
      return res.status(400).json({ error: 'No se pudo actualizar el perfil.' });
    }

    return res.json({ success: true, profile: updatedProfile });
  } catch (error) {
    console.error('[BACKEND PUT /profile/:userId] Error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/profile/:userId/cv-items', requireAuth, async (req, res) => {
  const parsed = cvProfileItemSchema.safeParse(req.body);
  if (!parsed.success) {
    const error = req.body?.kind === 'study'
      ? 'Revisa la institución, el título y las fechas del estudio.'
      : 'Escribe una habilidad de hasta 100 caracteres.';
    return res.status(400).json({ error });
  }

  try {
    const item = parsed.data;
    const save = item.kind === 'study' ? saveCvStudyToProfile : saveCvSkillToProfile;
    return res.json(await save(req.db, req.user.id, item));
  } catch (error) {
    console.error('[/profile/cv-items] Error:', error.code || error.name);
    return res.status(500).json({ error: 'No se pudo guardar el dato en Mi perfil. Vuelve a intentarlo.' });
  }
});

router.put('/profile/:userId/full', requireAuth, async (req, res) => {
  const parsed = fullProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    console.error('[PUT /profile/:userId/full] Error de validación Zod:', JSON.stringify(parsed.error.errors, null, 2));
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Los datos profesionales no son válidos.',
      details: parsed.error.errors
    });
  }
  const hasContactEmail = Object.hasOwn(parsed.data.profile, 'contact_email');
  const rpc = hasContactEmail ? 'replace_current_user_profile_data_v3' : 'replace_current_user_profile_data_v2';
  const { data, error } = await req.db.rpc(rpc, {
    p_profile: parsed.data.profile, p_academic: parsed.data.academic_background, p_work: parsed.data.work_experience,
  });
  if (error) {
    console.error('[PUT /profile/:userId/full] Error transaccional:', error);
    if (error.code === 'PGRST202' || error.code === '42883') {
      const migration = hasContactEmail ? 'v14' : 'v13';
      return res.status(503).json({ success: false, code: 'PROFILE_SCHEMA_UPDATE_REQUIRED', error: `Falta aplicar la migración ${migration} en Supabase. Tus cambios siguen en el formulario.` });
    }
    return res.status(500).json({ success: false, code: 'PROFILE_UPDATE_FAILED', error: 'No se pudieron guardar los datos profesionales.' });
  }
  return res.json({ success: true, profile: data });
});

export default router;

import { Router } from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import mammoth from 'mammoth';
import { requireAuth } from '../lib/authMiddleware.js';
import { generateWithFallback } from '../lib/AIProviderService.js';
import { SYSTEM_PROMPT_CV_IMPORT } from '../lib/prompts.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const router = Router();

// Configuración de Multer para recibir archivos en memoria (límite de 5 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

router.post('/profile/import-cv', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.warn('[BACKEND /profile/import-cv] No se subió ningún archivo');
      return res.status(400).json({ error: 'No se ha proporcionado ningún archivo de CV. Asegúrate de enviar el campo "file".' });
    }

    const { mimetype, size, originalname } = req.file;
    // Logs de propiedades del archivo (Requisito 5 de logs)
    console.log(`[BACKEND /profile/import-cv] mimetype: ${mimetype}`);
    console.log(`[BACKEND /profile/import-cv] originalname: ${originalname}`);
    console.log(`[BACKEND /profile/import-cv] size: ${size} bytes`);

    // 1. Validar mimetypes permitidos (Requisito 6 de validaciones)
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const extension = originalname.split('.').pop().toLowerCase();
    
    if (!allowedMimeTypes.includes(mimetype) && extension !== 'pdf' && extension !== 'docx') {
      console.warn('[BACKEND /profile/import-cv] Formato no soportado:', mimetype);
      return res.status(400).json({ error: 'Formato de archivo no soportado. Solo se permiten archivos PDF o DOCX.' });
    }

    // 2. Validar tamaño en backend (Requisito 11: Verificar que el archivo no supere 5 MB)
    if (size > 5 * 1024 * 1024) {
      console.warn('[BACKEND /profile/import-cv] Archivo excede el límite de 5 MB');
      return res.status(400).json({ error: 'El archivo excede el límite permitido de 5 MB.' });
    }

    let cvText = '';

    // 3. Extraer texto según tipo de archivo (Requisito 7: Si es PDF, extraer texto con pdf-parse)
    if (mimetype === 'application/pdf' || extension === 'pdf') {
      console.log('[BACKEND /profile/import-cv] Procesando archivo PDF...');
      try {
        const pdfData = await pdfParse(req.file.buffer);
        cvText = pdfData.text;
      } catch (pdfError) {
        console.error('[BACKEND /profile/import-cv] Error al parsear PDF:', pdfError);
        return res.status(422).json({ 
          error: `No se pudo extraer texto del CV. Error al procesar el archivo PDF: ${pdfError.message || pdfError}` 
        });
      }
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      extension === 'docx'
    ) {
      console.log('[BACKEND /profile/import-cv] Procesando archivo DOCX...');
      try {
        const docxResult = await mammoth.extractRawText({ buffer: req.file.buffer });
        cvText = docxResult.value;
      } catch (docxError) {
        console.error('[BACKEND /profile/import-cv] Error al parsear DOCX:', docxError);
        return res.status(422).json({ 
          error: `No se pudo extraer texto del CV. Error al procesar el archivo DOCX: ${docxError.message || docxError}` 
        });
      }
    }

    // Log temporal del texto extraído length (Requisito 5 de logs)
    console.log(`[BACKEND /profile/import-cv] texto extraído length: ${cvText ? cvText.length : 0}`);

    // 4. Validar longitud del texto extraído (Requisito 8 y 9)
    if (!cvText || cvText.trim().length <= 100) {
      console.warn('[BACKEND /profile/import-cv] Texto extraído es demasiado corto o no se pudo extraer');
      return res.status(422).json({ 
        error: 'No se pudo extraer texto del CV. El archivo subido parece no contener texto legible o tiene menos de 100 caracteres. Asegúrate de que no sea una imagen escaneada.' 
      });
    }

    // 5. Estructurar el CV con IA (BYOK: usa la key del usuario o cae al servidor)
    try {
      const extractedDataText = await generateWithFallback({
        useCase: 'cv_generation',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_CV_IMPORT },
          { role: 'user', content: `Texto CV:\n${cvText}` }
        ],
        db: req.db,
        userId: req.user.id,
        jsonMode: true,
        maxTokens: 1500
      });

      const parsedData = JSON.parse(extractedDataText);
      return res.json({
        success: true,
        data: parsedData
      });

    } catch (aiError) {
      console.error('[BACKEND /profile/import-cv] Error al estructurar el CV con IA:', aiError.message);
      return res.status(502).json({ error: 'No se pudo estructurar el CV con IA. Verifica tu API key o inténtalo de nuevo.' });
    }

  } catch (error) {
    console.error('[BACKEND /profile/import-cv] Error crítico:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /profile/import-text
// Importa un perfil a partir de TEXTO pegado (por ejemplo, copiado desde la
// página de perfil de LinkedIn). Reusa el mismo extractor que import-cv (HU05).
router.post('/profile/import-text', requireAuth, async (req, res) => {
  const { cvText } = req.body;
  if (!cvText || cvText.trim().length < 50) {
    return res.status(400).json({ error: 'Pega el texto de tu perfil (mínimo ~50 caracteres).' });
  }

  try {
    const extractedDataText = await generateWithFallback({
      useCase: 'cv_generation',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_CV_IMPORT },
        { role: 'user', content: `Texto del perfil:\n${cvText}` }
      ],
      db: req.db,
      userId: req.user.id,
      jsonMode: true,
      maxTokens: 1500
    });

    const parsedData = JSON.parse(extractedDataText);
    return res.json({ success: true, data: parsedData });
  } catch (aiError) {
    console.error('[/profile/import-text] Error:', aiError.message);
    return res.status(502).json({ error: 'No se pudo estructurar el texto con IA. Inténtalo de nuevo.' });
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
  console.log('[BACKEND PUT /profile/:userId] Params:', req.params, 'Body:', req.body);
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

export default router;

import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { fail } from '../lib/apiResponse.js';
import { requireAuth } from '../lib/authMiddleware.js';
import { renderDocumentPdf } from '../lib/documentPdf.js';

const router = Router();
const limit = rateLimit({ windowMs: 60000, max: 12, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Se alcanzó el límite de descargas. Espera un minuto y vuelve a intentarlo.' } });

router.post('/documents/pdf', limit, express.json({ limit: '512kb' }), requireAuth, async (req, res) => {
  const { html } = req.body ?? {};
  if (typeof html !== 'string' || !html.trim()) {
    return fail(res, 'El documento está vacío.', 400, 'PDF_EMPTY');
  }

  try {
    const bytes = await renderDocumentPdf(html);
    return res.set('Cache-Control', 'no-store').type('pdf').send(Buffer.from(bytes));
  } catch (error) {
    if (error.code === 'PDF_BUSY') return fail(res, error.message, 503, error.code);
    console.error('[documents/pdf] Falló el renderizado:', error.name);
    return fail(res, 'No se pudo preparar el PDF. Intenta descargarlo de nuevo.', 503, 'PDF_EXPORT_ERROR');
  }
});

router.use('/documents/pdf', (error, req, res, next) => {
  if (error.type === 'entity.too.large') return fail(res, 'El documento es demasiado extenso para exportarlo.', 413, 'PDF_TOO_LARGE');
  return next(error);
});

export default router;

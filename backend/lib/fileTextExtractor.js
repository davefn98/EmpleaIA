/**
 * lib/fileTextExtractor.js — Extracción de texto plano desde archivos de CV.
 *
 * Soporta PDF (pdf-parse), DOCX (mammoth) y TXT (lectura directa).
 * Lanza errores tipados con .status y .code para que la capa de rutas
 * responda con el mensaje real sin exponer detalles internos.
 */

import { createRequire } from 'module';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const NO_TEXT_MESSAGE =
  'No se pudo extraer texto automáticamente. Intenta subir un PDF con texto seleccionable o copia el contenido manualmente.';

const typedError = (message, status, code) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

/**
 * Extrae el texto de un archivo de CV subido en memoria (multer memoryStorage).
 *
 * @param {object} file
 * @param {Buffer} file.buffer
 * @param {string} file.mimetype
 * @param {string} file.originalname
 * @returns {Promise<string>} texto extraído (con al menos 100 caracteres útiles)
 */
export async function extractCvText({ buffer, mimetype, originalname }) {
  const extension = (originalname || '').split('.').pop().toLowerCase();

  let text = '';

  if (mimetype === 'application/pdf' || extension === 'pdf') {
    try {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text || '';
    } catch (pdfError) {
      console.error('[fileTextExtractor] Error al parsear PDF:', pdfError.message || pdfError);
      throw typedError(NO_TEXT_MESSAGE, 422, 'NO_TEXT_EXTRACTED');
    }
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === 'docx'
  ) {
    try {
      const docxResult = await mammoth.extractRawText({ buffer });
      text = docxResult.value || '';
    } catch (docxError) {
      console.error('[fileTextExtractor] Error al parsear DOCX:', docxError.message || docxError);
      throw typedError(NO_TEXT_MESSAGE, 422, 'NO_TEXT_EXTRACTED');
    }
  } else if (mimetype === 'text/plain' || extension === 'txt') {
    text = buffer.toString('utf8');
  } else {
    throw typedError(
      'Formato de archivo no soportado. Solo se permiten archivos PDF, DOCX o TXT.',
      400,
      'UNSUPPORTED_FORMAT'
    );
  }

  if (!text || text.trim().length <= 100) {
    throw typedError(NO_TEXT_MESSAGE, 422, 'NO_TEXT_EXTRACTED');
  }

  return text;
}

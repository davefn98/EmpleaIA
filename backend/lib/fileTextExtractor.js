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
const pdfParseModule = require('pdf-parse');

const typedError = (message, status, code) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

async function parsePdfBuffer(buffer) {
  const legacyParser = typeof pdfParseModule === 'function'
    ? pdfParseModule
    : typeof pdfParseModule.default === 'function'
      ? pdfParseModule.default
      : null;

  if (legacyParser) {
    const pdfData = await legacyParser(buffer);
    return {
      text: pdfData.text || '',
      numPages: pdfData.numpages || pdfData.numPages || 0
    };
  }

  if (typeof pdfParseModule.PDFParse !== 'function') {
    throw new Error('La librería pdf-parse no expone un parser compatible.');
  }

  const parser = new pdfParseModule.PDFParse({ data: buffer });
  try {
    const pdfData = await parser.getText();
    return {
      text: pdfData.text || '',
      numPages: pdfData.total || pdfData.numpages || pdfData.pages?.length || 0
    };
  } finally {
    await parser.destroy();
  }
}

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
  let isPdf = false;
  let numPages = 0;

  if (mimetype === 'application/pdf' || extension === 'pdf') {
    isPdf = true;
    try {
      const pdfData = await parsePdfBuffer(buffer);
      text = pdfData.text || '';
      numPages = pdfData.numPages || 0;
    } catch (pdfError) {
      console.error('[fileTextExtractor] Error al parsear PDF:', pdfError.message || pdfError);
      const msg = pdfError.message || String(pdfError);
      if (/password|encrypted|decrypt|permission/i.test(msg)) {
        throw typedError(
          'El archivo PDF está protegido con contraseña o encriptado. Quita la protección e intenta nuevamente.',
          422,
          'PDF_PASSWORD_PROTECTED'
        );
      }
      throw typedError(
        'Ocurrió un error técnico al analizar la estructura del PDF.',
        422,
        'PDF_PARSE_ERROR'
      );
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
      throw typedError(
        'No se pudo extraer texto del archivo Word (.docx) debido a un error de formato.',
        422,
        'DOCX_PARSE_ERROR'
      );
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

  const cleanText = text.replace(/\s+/g, ' ').trim();

  if (!cleanText || cleanText.length <= 100) {
    if (isPdf && numPages > 0) {
      throw typedError(
        'El PDF parece ser un escaneo o imagen digitalizada sin texto seleccionable. Por favor, sube un documento digital o copia y pega el texto manualmente.',
        422,
        'PDF_SCANNED'
      );
    }
    throw typedError(
      'El texto extraído del CV es demasiado corto (mínimo ~100 caracteres).',
      400,
      'TEXT_TOO_SHORT'
    );
  }

  return text;
}

/**
 * lib/fileTextExtractor.js — Extracción de texto plano desde archivos de CV.
 *
 * Soporta PDF (pdf-parse), DOCX (mammoth) y TXT (lectura directa).
 * Lanza errores tipados con .status y .code para que la capa de rutas
 * responda con el mensaje real sin exponer detalles internos.
 */

import { createRequire } from 'module';
import { copyFile, mkdtemp, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mammoth from 'mammoth';
import { createWorker, PSM } from 'tesseract.js';
import spanish from '@tesseract.js-data/spa';
import english from '@tesseract.js-data/eng';
import { normalizeOcrContrast } from './ocrContrast.js';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');

const typedError = (message, status, code) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

const MAX_OCR_PAGES = 6;
let activeOcrJobs = 0;
const textLength = (text) => text.replace(/\s/g, '').length;

async function readScannedPages(parser, pages) {
  if (pages.length > MAX_OCR_PAGES) {
    throw typedError('El PDF tiene más de seis páginas escaneadas. Divide el archivo e importa las partes por separado.', 422, 'PDF_OCR_PAGE_LIMIT');
  }
  if (activeOcrJobs >= 2) {
    throw typedError('El lector de documentos está ocupado. Vuelve a intentar en unos segundos.', 503, 'PDF_OCR_BUSY');
  }

  activeOcrJobs++;
  let worker;
  let modelDirectory;
  const languages = [spanish, english];
  try {
    const { pages: sizes } = await parser.getInfo({ parsePageInfo: true });
    modelDirectory = await mkdtemp(join(tmpdir(), 'empleaia-ocr-models-'));
    await Promise.all(languages.map(({ code, langPath }) => copyFile(
      join(langPath, '..', '4.0.0_best_int', `${code}.traineddata.gz`), join(modelDirectory, `${code}.traineddata.gz`),
    )));
    worker = await createWorker(languages.map(({ code }) => code), 1, { langPath: modelDirectory, cacheMethod: 'none', errorHandler: () => {} });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const recognized = new Map();
    for (const page of pages) {
      const size = sizes.find(({ pageNumber }) => pageNumber === page.num);
      if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
        throw new Error('Dimensiones de página inválidas');
      }
      const scale = Math.min(3.3, 2800 / Math.max(size.width, size.height));
      const screenshot = await parser.getScreenshot({ partial: [page.num], scale, imageDataUrl: false });
      const image = await normalizeOcrContrast(Buffer.from(screenshot.pages[0].data));
      const { data: { text } } = await worker.recognize(image);
      if (textLength(text) > textLength(page.text)) recognized.set(page.num, text);
    }
    return recognized;
  } catch {
    throw typedError('No se pudo leer la imagen del PDF. Sube una copia más nítida o pega el texto de tu CV.', 422, 'PDF_OCR_ERROR');
  } finally {
    await worker?.terminate().catch(() => {});
    if (modelDirectory) {
      await Promise.allSettled(languages.map(({ code }) => unlink(join(modelDirectory, `${code}.traineddata.gz`))));
      await rmdir(modelDirectory).catch(() => {});
    }
    activeOcrJobs--;
  }
}

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

  const parser = new pdfParseModule.PDFParse({ data: buffer, isEvalSupported: false, maxImageSize: 20000000 });
  try {
    const pdfData = await parser.getText();
    const scanned = pdfData.pages.filter((page) => textLength(page.text) <= 100);
    const recognized = scanned.length ? await readScannedPages(parser, scanned) : new Map();
    return {
      text: pdfData.pages.map((page) => recognized.get(page.num) || page.text).join('\n\n'),
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
      if (pdfError.status) throw pdfError;
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
        'No encontramos suficiente texto legible en el PDF. Sube una copia más nítida o pega el texto de tu CV.',
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

  // Retain paragraph and bullet boundaries for faithful mapping and loss checks.
  return text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
}

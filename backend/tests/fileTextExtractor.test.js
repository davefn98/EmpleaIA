import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCvText } from '../lib/fileTextExtractor.js';

function escapePdfText(text) {
  return text.replace(/[\\()]/g, '');
}

function createTextPdf(text) {
  const escapedText = escapePdfText(text);
  const stream = `BT /F1 12 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

test('extractCvText extrae texto desde PDF usando pdf-parse actual', async () => {
  const cvText = 'Juan Perez desarrollador frontend con experiencia en React Node.js Express Supabase OpenAI proyectos academicos correo juan@example.com telefono 987654321 habilidades comunicacion liderazgo trabajo en equipo y documentacion tecnica.';
  const result = await extractCvText({
    buffer: createTextPdf(cvText),
    mimetype: 'application/pdf',
    originalname: 'cv.pdf'
  });

  assert.match(result, /Juan Perez/);
  assert.match(result, /React/);
  assert.ok(result.length > 100);
});

test('extractCvText reporta PDF_PARSE_ERROR para PDFs inválidos', async () => {
  await assert.rejects(
    () => extractCvText({
      buffer: Buffer.from('%PDF-1.4\narchivo invalido'),
      mimetype: 'application/pdf',
      originalname: 'cv.pdf'
    }),
    (error) => error.status === 422 && error.code === 'PDF_PARSE_ERROR'
  );
});

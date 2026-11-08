import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { extractCvText } from '../lib/fileTextExtractor.js';

function escapePdfText(text) {
  return text.replace(/[\\()]/g, '');
}

function createPdf(resources, stream, resource) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << ${resources} >> /Contents 5 0 R >>`,
    resource,
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

  return Buffer.from(pdf, 'latin1');
}

function createTextPdf(text) {
  const lines = text.match(/.{1,65}(?:\s|$)/g).map((line) => `(${escapePdfText(line.trim())}) Tj`);
  return createPdf('/Font << /F1 4 0 R >>', `BT /F1 12 Tf 14 TL 72 720 Td ${lines.join(' T* ')} ET`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
}

function createScannedPdf() {
  const canvas = createCanvas(1224, 1584);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#101827';
  ctx.fillRect(0, 0, canvas.width, 180);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px Arial';
  ctx.fillText('ANA MARIA PRUEBA', 100, 105);
  ctx.font = '22px Arial';
  ctx.fillText('ana@example.com', 900, 90);
  ctx.fillStyle = '#101827';
  ctx.font = '32px Arial';
  [
    'Desarrolladora backend con experiencia en Node.js.',
    'Implementó integración continua con GitHub Actions.',
    'Documentó API REST y automatizó pruebas de software.',
    'Estudió Computación e Informática en Lima.',
  ].forEach((line, index) => ctx.fillText(line, 100, 275 + index * 66));
  const jpeg = canvas.toBuffer('image/jpeg');
  return createPdf('/XObject << /Im1 4 0 R >>', 'q 612 0 0 792 0 0 cm /Im1 Do Q',
    `<< /Type /XObject /Subtype /Image /Width 1224 /Height 1584 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${jpeg.toString('latin1')}\nendstream`);
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

test('extractCvText lee un CV escaneado, incluido el texto sobre un encabezado oscuro', async () => {
  const result = await extractCvText({ buffer: createScannedPdf(), mimetype: 'application/pdf' });

  assert.match(result, /ANA MARIA PRUEBA/i);
  assert.match(result, /ana@example\.com/i);
  assert.match(result, /GitHub Actions/i);
  assert.match(result, /Computación e Informática/i);
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

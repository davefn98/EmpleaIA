/**
 * letterValidator.js — Esquemas zod para los endpoints del módulo de cartas.
 *
 * Cada esquema cubre un endpoint. El controlador llama a `safeParse` y decide
 * qué error de aplicación devolver si la validación falla; el validador solo
 * describe la forma válida del dato.
 */

import { z } from 'zod';

/**
 * POST /letter-generate
 *
 * Requiere profileId y al menos uno de jobOfferText o jobDescription.
 */
export const letterGenerateSchema = z
  .object({
    profileId:      z.string().min(1),
    jobOfferText:   z.string().optional(),
    company:        z.string().optional(),
    targetRole:     z.string().optional(),
    jobDescription: z.string().optional(),
    tone:           z.string().optional(),
    document_title: z.string().optional(),
    status:         z.string().optional(),
  })
  .refine(
    (data) => Boolean(data.jobOfferText) || Boolean(data.jobDescription),
    {
      message: 'Faltan parámetros requeridos (jobOfferText o jobDescription)',
      path: ['jobOfferText'],
    }
  );

/**
 * PUT /letter/:id (cuerpo)
 *
 * Todos los campos son opcionales; el servicio ignora los ausentes.
 */
export const letterUpdateSchema = z.object({
  status:         z.string().optional(),
  document_title: z.string().optional(),
  letter_content: z.string().optional(),
});

/**
 * POST /letter-save
 *
 * Requiere profileId; el resto de campos son opcionales.
 */
export const letterSaveSchema = z.object({
  profileId:      z.string().min(1),
  jobOfferText:   z.string().optional(),
  letterContent:  z.string().optional(),
  documentTitle:  z.string().optional(),
  status:         z.string().optional(),
  company:        z.string().optional(),
  targetRole:     z.string().optional(),
  jobDescription: z.string().optional(),
  tone:           z.string().optional(),
});

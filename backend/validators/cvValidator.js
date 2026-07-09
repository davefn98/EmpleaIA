/**
 * cvValidator.js — Esquemas zod para los endpoints del módulo de CVs.
 *
 * Cada esquema cubre un endpoint. El controlador llama a `safeParse` y decide
 * qué error de aplicación devolver si la validación falla; el validador solo
 * describe la forma válida del dato.
 */

import { z } from 'zod';

/**
 * POST /cv-generate
 *
 * Requiere profileId. El resto de campos son opcionales.
 */
export const cvGenerateSchema = z.object({
  profileId:      z.string().min(1),
  document_title: z.string().optional(),
  status:         z.string().optional(),
  // cv_style es el objeto de tema del CV (template, colores, fuente…) que envía
  // el frontend; también admite string o null. Por eso se acepta libre.
  cv_style:       z.any().optional(),
  custom_target_role: z.string().optional(),
  cv_focus:       z.string().optional(),
  excluded_experience_ids: z.array(z.string()).optional(),
  excluded_skills: z.array(z.string()).optional(),
});

/**
 * POST /cv-parse
 *
 * Requiere profileId y cvText.
 */
export const cvParseSchema = z.object({
  profileId: z.string().min(1),
  cvText:    z.string().min(1),
});

/**
 * PUT /cv/:id (cuerpo)
 *
 * Todos los campos son opcionales; el servicio ignora los ausentes.
 * cv_data es JSON libre (objeto generado por IA), por eso se acepta z.any().
 */
export const cvUpdateSchema = z.object({
  status:         z.string().optional(),
  document_title: z.string().optional(),
  cv_style:       z.any().optional(),
  cv_data:        z.any().optional(),
});

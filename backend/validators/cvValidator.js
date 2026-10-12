/**
 * cvValidator.js — Esquemas zod para los endpoints del módulo de CVs.
 *
 * Cada esquema cubre un endpoint. El controlador llama a `safeParse` y decide
 * qué error de aplicación devolver si la validación falla; el validador solo
 * describe la forma válida del dato.
 */

import { z } from 'zod';

export const CV_TECHNICAL_SKILL_CATEGORIES = [
  'backend',
  'cloud',
  'architecture',
  'databases',
  'integration',
  'testing',
  'devops',
  'security',
  'frontend',
  'other',
];

const cvWorkExperienceSchema = z.object({
  source_id:  z.string(),
  company:    z.string(),
  role:       z.string(),
  start_date: z.string(),
  end_date:   z.string(),
  relevance:  z.enum(['high', 'medium', 'low']),
  bullets:    z.array(z.string().min(1)).max(6),
}).strict().superRefine((experience, ctx) => {
  const count = experience.bullets.length;
  if (count === 0) return;

  const valid = experience.relevance === 'high'
    ? count >= 3 && count <= 6
    : experience.relevance === 'medium'
      ? count >= 1 && count <= 3
      : count === 1;

  if (!valid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bullets'],
      message: 'Cantidad de bullets incompatible con la relevancia.',
    });
  }
});

const aiWorkExperienceSchema = z.object({
  source_id:  z.string(),
  company:    z.string(),
  role:       z.string(),
  start_date: z.string(),
  end_date:   z.string(),
  relevance:  z.enum(['high', 'medium', 'low']),
  bullets:    z.array(z.string().min(1)).max(6),
}).strict();

const cvAcademicBackgroundSchema = z.object({
  institution: z.string(),
  degree:      z.string(),
  start_date:  z.string(),
  end_date:    z.string(),
  description: z.string(),
}).strict();

const cvTechnicalSkillsSchema = z.object(
  Object.fromEntries(CV_TECHNICAL_SKILL_CATEGORIES.map((category) => [
    category,
    z.array(z.string().min(1)),
  ]))
).strict();

const candidateAcademicSchema = z.object({
  id:          z.string().optional(),
  institution: z.string(),
  degree:      z.string(),
  start_date:  z.string().nullable().optional(),
  end_date:    z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).strict();

const candidateExperienceSchema = z.object({
  id:           z.string().optional(),
  company:      z.string(),
  role:         z.string(),
  start_date:   z.string().nullable().optional(),
  end_date:     z.string().nullable().optional(),
  description:  z.string().nullable().optional(),
  achievements: z.array(z.string()).optional(),
  bullets:      z.array(z.string()).optional(),
}).strict();

const candidateDataSchema = z.object({
  personal_info: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
    portfolio: z.string().optional(),
    career:      z.string().optional(),
    target_role: z.string().optional(),
    bio:         z.string().nullable().optional(),
  }).strict(),
  skills: z.object({
    technical: z.array(z.string()),
    soft:      z.array(z.string()),
  }).strict(),
  academic_background: z.array(candidateAcademicSchema),
  work_experience:     z.array(candidateExperienceSchema),
  certifications:      z.array(z.string()).optional(),
}).strict();

/** Contrato persistido de un CV generado. Se valida incluso con Structured Outputs. */
export const generatedCvSchema = z.object({
  headline:             z.string(),
  professional_summary: z.string(),
  work_experience:      z.array(cvWorkExperienceSchema),
  academic_background:  z.array(cvAcademicBackgroundSchema),
  technical_skills:     cvTechnicalSkillsSchema,
  technical_skill_order: z.array(z.enum(CV_TECHNICAL_SKILL_CATEGORIES))
    .length(CV_TECHNICAL_SKILL_CATEGORIES.length)
    .refine((categories) => new Set(categories).size === CV_TECHNICAL_SKILL_CATEGORIES.length, {
      message: 'Cada categoría técnica debe aparecer exactamente una vez.',
    }),
  soft_skills:          z.array(z.string().min(1)),
  certifications:       z.array(z.string().min(1)),
}).strict();

/** Contrato de entrada de IA; la reconciliación normaliza cantidades y orden antes de persistir. */
export const aiGeneratedCvSchema = generatedCvSchema.extend({
  work_experience: z.array(aiWorkExperienceSchema),
  technical_skill_order: z.array(z.enum(CV_TECHNICAL_SKILL_CATEGORIES))
    .length(CV_TECHNICAL_SKILL_CATEGORIES.length),
}).strict();

// Document metadata comes from the candidate, never from generated AI text.
export const persistedCvSchema = generatedCvSchema.extend({
  snapshot_version: z.literal(1),
  personal_info: z.record(z.string()),
  target_job_description: z.string(),
  cv_focus: z.string(),
}).strict();

const stringArrayJsonSchema = { type: 'array', items: { type: 'string' } };

/** JSON Schema compatible con OpenAI Structured Outputs. */
export const generatedCvJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'headline', 'professional_summary', 'work_experience', 'academic_background',
    'technical_skills', 'technical_skill_order', 'soft_skills', 'certifications',
  ],
  properties: {
    headline: { type: 'string' },
    professional_summary: { type: 'string' },
    work_experience: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source_id', 'company', 'role', 'start_date', 'end_date', 'relevance', 'bullets'],
        properties: {
          source_id: { type: 'string' },
          company: { type: 'string' },
          role: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          relevance: { type: 'string', enum: ['high', 'medium', 'low'] },
          bullets: { type: 'array', items: { type: 'string' }, maxItems: 6 },
        },
      },
    },
    academic_background: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['institution', 'degree', 'start_date', 'end_date', 'description'],
        properties: {
          institution: { type: 'string' },
          degree: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    technical_skills: {
      type: 'object',
      additionalProperties: false,
      required: CV_TECHNICAL_SKILL_CATEGORIES,
      properties: Object.fromEntries(
        CV_TECHNICAL_SKILL_CATEGORIES.map((category) => [category, stringArrayJsonSchema])
      ),
    },
    technical_skill_order: {
      type: 'array',
      items: { type: 'string', enum: CV_TECHNICAL_SKILL_CATEGORIES },
      minItems: CV_TECHNICAL_SKILL_CATEGORIES.length,
      maxItems: CV_TECHNICAL_SKILL_CATEGORIES.length,
    },
    soft_skills: stringArrayJsonSchema,
    certifications: stringArrayJsonSchema,
  },
};

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
  candidate_data: candidateDataSchema.optional(),
  target_job_description: z.string().refine((value) => !value.includes('\0'), {
    message: 'La descripción del puesto contiene un carácter no válido.',
  }).optional().nullable(),
}).strict();

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

// Importación fiel: los bullets completos no tienen el límite del CV adaptado.
const importedText = z.string();
const importedDate = z.string().nullable();
export const importedCvSchema = z.object({
  first_name: importedText, last_name: importedText, email: importedText,
  phone: importedText, location: importedText, linkedin: importedText,
  career: importedText, target_role: importedText,
  target_job_description: importedText, bio: importedText,
  technical_skills: z.array(importedText), soft_skills: z.array(importedText),
  work_experience: z.array(z.object({
    company: importedText, role: importedText, start_date: importedText,
    end_date: importedDate, description: importedText,
    achievements: z.array(importedText),
  }).strict()),
  academic_background: z.array(z.object({
    institution: importedText, degree: importedText,
    start_date: importedText, end_date: importedDate, description: importedText,
  }).strict()),
}).strict();

const importObjectSchema = (properties) => ({
  type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
});
const importTextJson = { type: 'string' };
const importDateJson = { type: ['string', 'null'] };
const importStringsJson = { type: 'array', items: importTextJson };
export const importedCvJsonSchema = importObjectSchema({
  first_name: importTextJson, last_name: importTextJson, email: importTextJson,
  phone: importTextJson, location: importTextJson, linkedin: importTextJson,
  career: importTextJson, target_role: importTextJson,
  target_job_description: importTextJson, bio: importTextJson,
  technical_skills: importStringsJson, soft_skills: importStringsJson,
  work_experience: { type: 'array', items: importObjectSchema({
    company: importTextJson, role: importTextJson, start_date: importTextJson,
    end_date: importDateJson, description: importTextJson, achievements: importStringsJson,
  }) },
  academic_background: { type: 'array', items: importObjectSchema({
    institution: importTextJson, degree: importTextJson, start_date: importTextJson,
    end_date: importDateJson, description: importTextJson,
  }) },
});

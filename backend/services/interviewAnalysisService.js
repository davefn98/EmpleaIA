import { z } from 'zod';
import { SYSTEM_PROMPT_INTERVIEW_FINAL } from '../lib/prompts.js';
import { buildFinalInterviewPrompt, resolveTokens, sanitizeContentFeedback } from './interviewService.js';

const text = z.string().trim().min(1);
const analysisSchema = z.object({
  overall_score: z.number().finite().min(0).max(100),
  general_analysis: text,
  strengths: z.array(text),
  improvements: z.array(text),
  recommendations: z.array(z.object({
    weakness: text,
    suggested_resource: text,
    reason: text,
  })).min(3),
});

// El esquema guía a los proveedores compatibles; se valida localmente en todos.
export const interviewAnalysisJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['overall_score', 'general_analysis', 'strengths', 'improvements', 'recommendations'],
  properties: {
    overall_score: { type: 'number', minimum: 0, maximum: 100 },
    general_analysis: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    recommendations: {
      type: 'array', minItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['weakness', 'suggested_resource', 'reason'],
        properties: {
          weakness: { type: 'string' },
          suggested_resource: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

export class InvalidInterviewAnalysisError extends Error {
  constructor(fields) {
    super('La IA devolvió un análisis incompleto o con formato inválido. Tus respuestas siguen guardadas; puedes volver a generar el feedback.');
    this.code = 'invalid_ai_analysis';
    this.fields = fields;
  }
}

export function parseInterviewAnalysis(content) {
  let parsed;
  try {
    // Algunos proveedores envuelven el JSON en Markdown aun con jsonMode.
    const raw = typeof content === 'string' ? content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1') : '';
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidInterviewAnalysisError(['json']);
  }
  const validation = analysisSchema.safeParse(sanitizeContentFeedback(parsed));
  if (!validation.success) {
    throw new InvalidInterviewAnalysisError([...new Set(validation.error.issues.map(issue => issue.path.join('.') || 'analysis'))]);
  }
  return validation.data;
}

export async function generateInterviewAnalysis({ req, interview, pairs, generate, maxTokens = 1800, logger = console }) {
  const prompt = buildFinalInterviewPrompt(interview, pairs);
  let tokens = 0;
  let invalidFields = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_INTERVIEW_FINAL },
      { role: 'user', content: prompt },
    ];
    if (attempt) messages.push({
      role: 'user',
      content: `El intento anterior no cumplió el contrato en estos campos: ${invalidFields.join(', ')}. Genera nuevamente el objeto completo, con puntuación numérica entre 0 y 100 y al menos 3 actividades prácticas distintas. Mantén la evaluación basada exclusivamente en las respuestas registradas; no inventes evidencia.`,
    });
    // Los errores de conexión, cuota o credenciales no disparan este reintento.
    const { content, usage, provider, model } = await generate({
      useCase: 'interview_feedback', messages,
      db: req.db, userId: req.user.id, jsonMode: true,
      responseSchema: interviewAnalysisJsonSchema, maxTokens,
    });
    tokens += resolveTokens(usage, messages.map(message => message.content).join('\n') + (content || ''));
    try {
      return {
        result: { ...parseInterviewAnalysis(content), ai_provider: provider || null, ai_model: model || null, prompt_version: 'pi2-interview-v4-validated' },
        tokens,
      };
    } catch (error) {
      if (!(error instanceof InvalidInterviewAnalysisError)) throw error;
      invalidFields = error.fields;
      // Solo metadatos: no registrar el perfil ni las respuestas del candidato.
      logger.warn('[interview/analysis] Respuesta inválida:', { attempt: attempt + 1, provider, model, fields: invalidFields });
      if (attempt === 1) throw error;
    }
  }
}

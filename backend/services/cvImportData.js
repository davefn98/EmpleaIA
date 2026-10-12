import { importedCvSchema } from '../validators/cvValidator.js';

export const MAX_CV_IMPORT_CHARACTERS = 40000;

function importError(message, code, status = 422) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function cvImportTokenBudget(cvText) {
  if (typeof cvText !== 'string' || !cvText.trim()) {
    throw importError('Adjunta o pega el texto de tu CV.', 'BAD_REQUEST', 400);
  }
  if (cvText.length > MAX_CV_IMPORT_CHARACTERS) {
    throw importError('El CV supera los 40 000 caracteres. Importa un documento más corto; no se ha recortado ni guardado ningún dato.', 'CV_IMPORT_TOO_LONG', 400);
  }
  return Math.min(14000, Math.max(6500, Math.ceil(cvText.length / 3) + 1200));
}

const normalize = (value) => String(value || '').normalize('NFKC')
  .replace(/[•●▪✓✔*]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Unifica lo que el editor muestra para que ningún logro quede oculto. */
export function fullExperienceDescription(record) {
  const description = String(record.description || '').trim();
  const normalizedDescription = normalize(description);
  const missing = (record.achievements || []).filter((achievement) =>
    !normalizedDescription.includes(normalize(achievement))
  );
  return [description, ...missing].filter(Boolean).join('\n');
}

/** Rechaza JSON truncado, formas inesperadas y viñetas explícitas omitidas. */
export function parseImportedCv(raw, sourceText = '') {
  let candidate;
  try {
    candidate = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw importError('La IA devolvió información incompleta. No se modificó tu formulario; vuelve a importar el CV.', 'CV_IMPORT_INVALID_RESPONSE');
  }
  const validation = importedCvSchema.safeParse(candidate);
  if (!validation.success) {
    throw importError('La información extraída no cumple el formato esperado. No se modificó tu formulario; inténtalo nuevamente.', 'CV_IMPORT_INVALID_RESPONSE');
  }
  const result = validation.data;
  result.work_experience = result.work_experience.map((record) => ({
    ...record, description: fullExperienceDescription(record),
  }));
  // Compare only explicit source bullet lines. This is a loss detector, not a
  // claim that arbitrary PDF layout or factual fidelity can be proven locally.
  const sourceBullets = sourceText.split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:[•●▪✓✔*−–-]|\d+[.)])\s*(.+)$/)?.[1])
    .filter((line) => line && line.trim().length >= 25);
  const collectStrings = (value) => typeof value === 'string' ? [value]
    : value && typeof value === 'object' ? Object.values(value).flatMap(collectStrings) : [];
  const corpus = normalize(collectStrings(result).join('\n'));
  const missing = sourceBullets.filter((line) => !corpus.includes(normalize(line)));
  if (missing.length) {
    throw importError(`La IA omitió ${missing.length} viñeta(s) del documento. No se importó una versión parcial: vuelve a intentarlo o pega el texto completo.`, 'CV_IMPORT_INCOMPLETE');
  }
  return result;
}

/** Contrato histórico de Mi perfil; ambas pantallas comparten el mismo parser. */
export function importedCvToProfile(parsed) {
  return {
    full_name: [parsed.first_name, parsed.last_name].filter(Boolean).join(' '),
    first_name: parsed.first_name, last_name: parsed.last_name,
    email: parsed.email, phone: parsed.phone, location: parsed.location,
    career: parsed.career, target_position: parsed.target_role,
    target_job_description: parsed.target_job_description,
    professional_summary: parsed.bio,
    technical_skills: parsed.technical_skills, soft_skills: parsed.soft_skills,
    education: parsed.academic_background, experience: parsed.work_experience,
  };
}

/**
 * cvService.js — Lógica de negocio del módulo de CVs.
 *
 * Orquesta la generación de IA, los fallbacks honestos y las operaciones CRUD
 * delegando la persistencia a cvRepository.
 *
 * Regla de integridad de datos: los fallbacks usan ÚNICAMENTE datos reales del
 * usuario o campos vacíos ("" / []) cuando el dato no existe. Prohibido asignar
 * valores genéricos inventados (nombres de carrera, listas de skills por defecto,
 * roles de trabajo asumidos, etc.).
 *
 * Este módulo no conoce req/res ni códigos HTTP: recibe datos, devuelve datos
 * o lanza errores con `.status` y `.code` para que el controlador los traduzca.
 */

import { SYSTEM_PROMPT_CV } from '../lib/prompts.js';
import { generateWithFallback }                      from '../lib/AIProviderService.js';
import { SYSTEM_PROMPT_CV_IMPORT_FAITHFUL } from '../lib/cvImportPrompt.js';
import { cvImportTokenBudget, parseImportedCv } from './cvImportData.js';
import { importedCvJsonSchema } from '../validators/cvValidator.js';
import { fullProfileUpdateSchema } from '../validators/profileValidator.js';
import * as cvRepo                                   from '../repositories/cvRepository.js';
import {
  CV_TECHNICAL_SKILL_CATEGORIES,
  aiGeneratedCvSchema,
  generatedCvJsonSchema,
  generatedCvSchema,
  persistedCvSchema,
} from '../validators/cvValidator.js';

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

/**
 * Crea un error de aplicación tipado con status HTTP y código de negocio.
 *
 * @param {string} message
 * @param {number} status
 * @param {string} [code]
 * @returns {Error}
 */
function appError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

/**
 * Fallback honesto para cv-generate cuando la IA no está disponible.
 *
 * Estructura el CV únicamente con la información real que el usuario ya
 * ingresó. No se inventan logros, métricas, empresas, instituciones ni
 * habilidades — eso pondría datos falsos en un CV real.
 *
 * @param {object} profile       - Registro de la tabla profiles
 * @param {object} userInputData - Objeto consolidado con academic/work del usuario
 * @returns {object}             - Objeto cvJson con la misma forma que la IA devuelve
 */
const SKILL_CATEGORY_PATTERNS = {
  backend: /\b(node(?:\.js)?|express|java|spring|python|django|flask|php|laravel|c#|\.net|golang|go|ruby|rails|nestjs)\b/i,
  cloud: /\b(aws|azure|gcp|cloud|lambda|cloudflare|firebase)\b/i,
  architecture: /\b(architecture|arquitectura|microservices|microservicios|solid|ddd|clean architecture|event driven|patrones de dise[nñ]o)\b/i,
  databases: /\b(sql|postgres(?:ql)?|mysql|mariadb|mongodb|redis|oracle|sqlite|database|base de datos|supabase)\b/i,
  integration: /\b(rest|graphql|soap|api|kafka|rabbitmq|webhook|integraci[oó]n)\b/i,
  testing: /\b(jest|vitest|mocha|junit|pytest|cypress|playwright|selenium|testing|pruebas?)\b/i,
  devops: /\b(docker|kubernetes|terraform|jenkins|github actions|gitlab ci|ci\/?cd|devops|git)\b/i,
  security: /\b(oauth|jwt|owasp|security|seguridad|pentest|iam)\b/i,
  frontend: /\b(react|angular|vue|svelte|javascript|typescript|html|css|tailwind|bootstrap|frontend|next(?:\.js)?)\b/i,
};

const SKILL_ALIASES = [
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['node', 'node js', 'nodejs'],
  ['postgres', 'postgresql'],
  ['amazon web services', 'aws'],
  ['google cloud platform', 'gcp'],
  ['continuous integration continuous delivery', 'ci cd'],
  ['rest api', 'restful api', 'api rest'],
];

const KNOWN_TECHNOLOGY_ALIASES = [
  ['node', 'node js', 'nodejs'], ['express'], ['java'], ['spring'], ['python'], ['django'],
  ['flask'], ['php'], ['laravel'], ['c#'], ['net'], ['go', 'golang'], ['ruby'], ['rails'],
  ['nestjs'], ['aws', 'amazon web services'], ['azure'], ['gcp', 'google cloud platform'],
  ['lambda'], ['cloudflare'], ['firebase'], ['sql'], ['postgres', 'postgresql'], ['mysql'],
  ['mariadb'], ['mongodb'], ['redis'], ['oracle'], ['sqlite'], ['supabase'], ['graphql'],
  ['soap'], ['kafka'], ['rabbitmq'], ['jest'], ['vitest'], ['mocha'], ['junit'], ['pytest'],
  ['cypress'], ['playwright'], ['selenium'], ['docker'], ['kubernetes'], ['terraform'],
  ['jenkins'], ['oauth'], ['jwt'], ['owasp'], ['react'], ['angular'], ['vue'], ['svelte'],
  ['javascript', 'js'], ['typescript', 'ts'], ['html'], ['css'], ['tailwind'], ['bootstrap'],
  ['next js', 'nextjs'],
];

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => text(value).trim())
    .filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function emptyTechnicalSkills() {
  return Object.fromEntries(CV_TECHNICAL_SKILL_CATEGORIES.map((category) => [category, []]));
}

function categorizeSkills(skills) {
  const categorized = emptyTechnicalSkills();
  for (const skill of uniqueStrings(skills)) {
    const category = Object.entries(SKILL_CATEGORY_PATTERNS)
      .find(([, pattern]) => pattern.test(skill))?.[0] || 'other';
    categorized[category].push(skill);
  }
  return categorized;
}

function orderedSkillCategories(technicalSkills, preferredOrder = CV_TECHNICAL_SKILL_CATEGORIES) {
  const preferred = uniqueStrings(preferredOrder)
    .filter((category) => CV_TECHNICAL_SKILL_CATEGORIES.includes(category));
  const missing = CV_TECHNICAL_SKILL_CATEGORIES.filter((category) => !preferred.includes(category));
  return [...preferred, ...missing].sort((left, right) => {
    const leftHasSkills = technicalSkills[left]?.length > 0 ? 0 : 1;
    const rightHasSkills = technicalSkills[right]?.length > 0 ? 0 : 1;
    return leftHasSkills - rightHasSkills;
  });
}

function skillOrderFromTarget(technicalSkills, targetJobDescription) {
  const target = normalize(targetJobDescription);
  if (!target) return orderedSkillCategories(technicalSkills);

  return [...CV_TECHNICAL_SKILL_CATEGORIES].sort((left, right) => {
    const score = (category) => (technicalSkills[category] || []).reduce(
      (total, skill) => total + (includesNormalizedPhrase(target, normalize(skill)) ? 2 : 0),
      SKILL_CATEGORY_PATTERNS[category]?.test(targetJobDescription) ? 1 : 0
    );
    return score(right) - score(left);
  });
}

function buildSupportedHeadline(userInputData, technicalSkills) {
  const role = text(userInputData.personal_info?.target_role || userInputData.personal_info?.career).trim();
  const highlights = orderedSkillCategories(technicalSkills)
    .flatMap((category) => technicalSkills[category])
    .slice(0, 3);
  return uniqueStrings([role, ...highlights]).join(' | ');
}

function sourceAcademicRecord(record) {
  return {
    institution: text(record.institution),
    degree:      text(record.degree),
    start_date:  text(record.start_date),
    end_date:    text(record.end_date),
    description: text(record.description),
  };
}

function sourceWorkRecord(record, relevance = 'low', bullets) {
  const sourceBullets = uniqueStrings([
    ...(Array.isArray(record.achievements) ? record.achievements : []),
    record.description,
  ]);
  const limits = { high: 6, medium: 3, low: 1 };
  const selectedBullets = uniqueStrings(bullets === undefined ? sourceBullets : bullets).slice(0, limits[relevance]);
  const compatibleRelevance = selectedBullets.length === 0
    ? 'low'
    : relevance === 'high' && selectedBullets.length < 3
      ? 'medium'
      : relevance;
  return {
    source_id:  text(record.id),
    company:    text(record.company),
    role:       text(record.role),
    start_date: text(record.start_date),
    end_date:   text(record.end_date),
    relevance: compatibleRelevance,
    bullets: selectedBullets.slice(0, limits[compatibleRelevance]),
  };
}

function getCertifications(profile) {
  return uniqueStrings((profile.certifications || []).map((certification) =>
    typeof certification === 'string'
      ? certification
      : certification?.name || certification?.title || certification?.certification || ''
  ));
}

function sourceCorpus(profile, userInputData) {
  return [
    userInputData.personal_info?.bio || profile.bio,
    userInputData.personal_info?.career,
    userInputData.personal_info?.target_role,
    ...(userInputData.skills?.technical || []),
    ...(userInputData.skills?.soft || []),
    ...(userInputData.certifications || getCertifications(profile)),
    ...(userInputData.work_experience || []).flatMap((record) => [
      record.description,
      ...(Array.isArray(record.achievements) ? record.achievements : []),
    ]),
    ...(userInputData.academic_background || []).map((record) => record.description),
  ].filter(Boolean).join(' ');
}

function isSupported(value, corpus) {
  const candidate = normalize(value);
  const normalizedCorpus = ` ${normalize(corpus)} `;
  if (!candidate) return false;
  if (normalizedCorpus.includes(` ${candidate} `)) return true;
  const aliases = SKILL_ALIASES.find((group) => group.includes(candidate));
  return Boolean(aliases?.some((alias) => normalizedCorpus.includes(` ${alias} `)));
}

function includesNormalizedPhrase(normalizedText, phrase) {
  return ` ${normalizedText} `.includes(` ${phrase} `);
}

function hasUnsupportedTechnology(value, corpus) {
  const normalizedValue = normalize(value);
  const normalizedCorpus = normalize(corpus);
  return KNOWN_TECHNOLOGY_ALIASES.some((aliases) =>
    aliases.some((alias) => includesNormalizedPhrase(normalizedValue, alias)) &&
    !aliases.some((alias) => includesNormalizedPhrase(normalizedCorpus, alias))
  );
}

function hasUnsupportedMetric(value, corpus) {
  const metrics = text(value).match(/\b\d+(?:[.,]\d+)?%?/g) || [];
  const sourceMetrics = new Set(text(corpus).match(/\b\d+(?:[.,]\d+)?%?/g) || []);
  return metrics.some((metric) => !sourceMetrics.has(metric));
}

const EVIDENCE_STOP_WORDS = new Set([
  'para', 'como', 'desde', 'entre', 'sobre', 'mediante', 'utilizando', 'participando',
  'experiencia', 'soluciones', 'sistemas',
  'aplicaciones', 'servicios', 'proyectos', 'equipo', 'entornos', 'procesos',
]);

function evidenceTerms(value) {
  return normalize(value).split(' ')
    .filter((term) => term.length >= 4 && !EVIDENCE_STOP_WORDS.has(term));
}

function hasEvidenceOverlap(value, evidence) {
  const sourceTerms = evidenceTerms(evidence);
  const claimTerms = evidenceTerms(value);
  if (claimTerms.length === 0) return true;
  const matches = claimTerms.filter((claim) => sourceTerms.some((source) =>
    claim === source || (claim.length >= 6 && source.length >= 6 && claim.slice(0, 6) === source.slice(0, 6))
  )).length;
  return matches >= Math.min(2, claimTerms.length) && matches / claimTerms.length >= 0.35;
}

function hasUnsupportedNamedTerm(value, evidence) {
  const normalizedEvidence = ` ${normalize(evidence)} `;
  const namedTerms = [...text(value).matchAll(/\b[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.+#/-]{1,}\b/g)];
  return namedTerms.some((match) => {
    if (match.index === 0) return false;
    const term = normalize(match[0]);
    return term.length > 1 && !normalizedEvidence.includes(` ${term} `);
  });
}

function sanitizeBullets(record, bullets) {
  const evidence = [
    record.description,
    ...(Array.isArray(record.achievements) ? record.achievements : []),
  ].filter(Boolean).join(' ');
  return uniqueStrings(bullets).filter((bullet) =>
    !hasUnsupportedTechnology(bullet, evidence) &&
    !hasUnsupportedNamedTerm(bullet, evidence) &&
    !hasUnsupportedMetric(bullet, evidence) &&
    hasEvidenceOverlap(bullet, evidence)
  );
}

function filterSupported(values, corpus, alreadyUsed = new Set()) {
  return uniqueStrings(values).filter((value) => {
    const key = normalize(value);
    if (alreadyUsed.has(key) || !isSupported(value, corpus)) return false;
    alreadyUsed.add(key);
    return true;
  });
}

function relevanceFromSource(record, targetJobDescription) {
  const targetWords = new Set(normalize(targetJobDescription).split(' ').filter((word) => word.length >= 4));
  if (targetWords.size === 0) return 'low';
  const recordWords = new Set(normalize([
    record.role,
    record.description,
    ...(record.achievements || []),
  ].join(' ')).split(' '));
  const matches = [...targetWords].filter((word) => recordWords.has(word)).length;
  return matches >= 3 ? 'high' : matches >= 1 ? 'medium' : 'low';
}

/** Fallback honesto que cumple exactamente el contrato persistido. */
export function buildFallbackCv(profile, userInputData, targetJobDescription = '') {
  const roleName = userInputData.personal_info?.target_role || profile.target_role || '';
  const careerName = userInputData.personal_info?.career || profile.career || '';
  const technicalSkills = categorizeSkills(userInputData.skills?.technical || profile.technical_skills || []);
  return {
    headline: buildSupportedHeadline(userInputData, technicalSkills) || roleName || careerName,
    professional_summary: userInputData.personal_info?.bio || profile.bio || '',
    work_experience: (userInputData.work_experience || []).map((record) =>
      sourceWorkRecord(record, relevanceFromSource(record, targetJobDescription))
    ),
    academic_background: (userInputData.academic_background || []).map(sourceAcademicRecord),
    technical_skills: technicalSkills,
    technical_skill_order: skillOrderFromTarget(technicalSkills, targetJobDescription),
    soft_skills: uniqueStrings(userInputData.skills?.soft || profile.soft_skills || []),
    certifications: uniqueStrings(userInputData.certifications || getCertifications(profile)),
  };
}

/** Valida el JSON de IA y repone todos los campos inmutables desde la fuente. */
export function parseAndReconcileGeneratedCv(rawJson, profile, userInputData) {
  const parsedJson = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  const generated = aiGeneratedCvSchema.parse(parsedJson);
  const sourceWork = userInputData.work_experience || [];
  const usedSourceIndexes = new Set();
  const reconciledWork = [];

  for (const generatedRecord of generated.work_experience) {
    let sourceIndex = sourceWork.findIndex((record, index) =>
      !usedSourceIndexes.has(index) && text(record.id) === generatedRecord.source_id
    );
    if (sourceIndex < 0 && generatedRecord.source_id === '') {
      sourceIndex = sourceWork.findIndex((record, index) =>
        !usedSourceIndexes.has(index) && text(record.id) === '' &&
        normalize(record.company) === normalize(generatedRecord.company) &&
        normalize(record.role) === normalize(generatedRecord.role)
      );
    }
    if (sourceIndex < 0) continue;
    usedSourceIndexes.add(sourceIndex);
    reconciledWork.push(sourceWorkRecord(
      sourceWork[sourceIndex],
      generatedRecord.relevance,
      sanitizeBullets(sourceWork[sourceIndex], generatedRecord.bullets)
    ));
  }

  sourceWork.forEach((record, index) => {
    if (!usedSourceIndexes.has(index)) reconciledWork.push(sourceWorkRecord(record));
  });

  const corpus = sourceCorpus(profile, userInputData);
  const usedSkills = new Set();
  let technicalSkills = emptyTechnicalSkills();
  for (const category of CV_TECHNICAL_SKILL_CATEGORIES) {
    technicalSkills[category] = filterSupported(generated.technical_skills[category], corpus, usedSkills);
  }
  if (Object.values(technicalSkills).every((skills) => skills.length === 0)) {
    technicalSkills = categorizeSkills(userInputData.skills?.technical || []);
  }

  const result = {
    headline: buildSupportedHeadline(userInputData, technicalSkills),
    professional_summary: !generated.professional_summary.trim() ||
      hasUnsupportedTechnology(generated.professional_summary, corpus) ||
      hasUnsupportedNamedTerm(generated.professional_summary, corpus) ||
      hasUnsupportedMetric(generated.professional_summary, corpus) ||
      !hasEvidenceOverlap(generated.professional_summary, corpus)
      ? userInputData.personal_info?.bio || profile.bio || ''
      : generated.professional_summary,
    work_experience: reconciledWork,
    academic_background: (userInputData.academic_background || []).map(sourceAcademicRecord),
    technical_skills: technicalSkills,
    technical_skill_order: orderedSkillCategories(technicalSkills, generated.technical_skill_order),
    soft_skills: filterSupported(generated.soft_skills, corpus),
    certifications: filterSupported(
      generated.certifications,
      uniqueStrings(userInputData.certifications || getCertifications(profile)).join(' ')
    ),
  };
  return generatedCvSchema.parse(result);
}

export function buildCvUserPrompt(userInputData, targetJobDescription, focusDescription) {
  return [
    `TARGET_JOB_DESCRIPTION:\n${targetJobDescription || '(vacante no proporcionada)'}`,
    `ENFOQUE DE PRESENTACION:\n${focusDescription}`,
    `DATOS DEL CANDIDATO (unica fuente factual):\n${JSON.stringify(userInputData)}`,
    'Genera el CV aplicando matching ATS y todas las reglas de fidelidad del sistema.',
  ].join('\n\n');
}

/**
 * Fallback honesto para cv-parse cuando la IA no está disponible.
 *
 * Extrae datos del texto del CV usando expresiones regulares. Cuando un campo
 * no puede extraerse del texto real del CV queda vacío ("" o []) — nunca se
 * asigna un valor genérico inventado como "Computación e Informática" o listas
 * de habilidades por defecto.
 *
 * La detección por keywords (p. ej. "redes" → "Redes y Seguridad de TI") es una
 * heurística que sí parte del texto del usuario. El inicio vacío ("") garantiza
 * que, si ningún keyword coincide, el campo quede en blanco en lugar de tener
 * un valor fabricado.
 *
 * Exportada para permitir su test unitario en aislamiento.
 *
 * @param {string} cvText
 * @returns {object}
 */
export function buildFallbackParsedData(cvText) {
  const textLower = cvText.toLowerCase();

  // Intentar extraer nombre de la primera línea no vacía
  let first_name = '';
  let last_name  = '';
  const lines = cvText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 0) {
    const nameParts = lines[0].split(' ');
    if (nameParts.length >= 2) {
      first_name = nameParts[0];
      last_name  = nameParts.slice(1).join(' ');
    } else {
      first_name = nameParts[0];
    }
  }

  // Buscar email
  const emailMatch = cvText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // Buscar teléfono
  const phoneMatch = cvText.match(/(?:\+?\d{1,3}[- ]?)?\d{9,10}/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  // Carrera: detectada por keywords del texto; vacía si ninguno coincide (sin valor por defecto inventado)
  let career = '';
  if (textLower.includes('redes'))           career = 'Redes y Seguridad de TI';
  else if (textLower.includes('diseño'))     career = 'Diseño y Desarrollo de Software';
  else if (textLower.includes('industrial')) career = 'Electrónica Industrial';
  else if (textLower.includes('sistemas'))   career = 'Ingeniería de Sistemas';

  // Puesto objetivo: detectado por keywords; vacío si ninguno coincide (sin valor por defecto inventado)
  let target_role = '';
  if (textLower.includes('frontend'))                                          target_role = 'Junior Frontend Developer';
  else if (textLower.includes('backend'))                                      target_role = 'Junior Backend Developer';
  else if (textLower.includes('fullstack') || textLower.includes('full stack')) target_role = 'Junior Full Stack Developer';
  else if (textLower.includes('soporte') || textLower.includes('técnico'))     target_role = 'Soporte Técnico de TI';

  // Habilidades técnicas: solo las encontradas en el texto — array vacío si no hay ninguna
  const techKeywords = [
    'react', 'node', 'javascript', 'python', 'html', 'css', 'sql',
    'postgresql', 'git', 'supabase', 'docker', 'angular', 'vue',
    'java', 'c#', 'php',
  ];
  const technical_skills = [];
  techKeywords.forEach((kw) => {
    if (textLower.includes(kw)) {
      const cap =
        kw === 'sql' || kw === 'html' || kw === 'css'
          ? kw.toUpperCase()
          : kw.charAt(0).toUpperCase() + kw.slice(1);
      technical_skills.push(cap);
    }
  });
  // Sin lista por defecto: si el texto no menciona ningún skill, el array queda vacío.

  // Habilidades blandas: solo las encontradas en el texto — array vacío si no hay ninguna
  const softKeywords = [
    'scrum', 'comunicación', 'equipo', 'proactivo', 'liderazgo',
    'organización', 'empatía', 'resolución', 'presión',
  ];
  const soft_skills = [];
  softKeywords.forEach((kw) => {
    if (textLower.includes(kw)) {
      const cap = kw.charAt(0).toUpperCase() + kw.slice(1);
      soft_skills.push(cap);
    }
  });
  // Sin lista por defecto: si el texto no menciona ninguna habilidad, el array queda vacío.

  // Bio: construida solo con los datos extraídos; vacía si no se extrajo career ni target_role
  const bioSegments = [
    career      ? `Egresado de ${career}` : null,
    target_role ? `orientado a desempeñarse como ${target_role}` : null,
  ].filter(Boolean);
  const bio = bioSegments.length > 0 ? bioSegments.join(' ') + '.' : '';

  return {
    first_name: first_name || '',
    last_name:  last_name  || '',
    email:      email      || '',
    phone:      phone      || '',
    career,
    target_role,
    bio,
    technical_skills,
    soft_skills,
    work_experience:     [],
    academic_background: [],
  };
}

// ---------------------------------------------------------------------------
// Funciones exportadas
// ---------------------------------------------------------------------------

/**
 * Genera un CV con IA y lo persiste en la base de datos.
 *
 * Si la IA falla, usa el fallback honesto (datos reales del usuario).
 * Si la persistencia falla por columnas de metadatos faltantes (migración
 * pendiente), reintenta sin esas columnas; si aun así falla, lanza un error
 * 500 tipado con mensaje claro para el cliente.
 *
 * @param {object} params
 * @param {object} params.db             - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId         - ID del usuario autenticado (req.user.id)
 * @param {string} params.profileId
 * @param {string} [params.document_title]
 * @param {string} [params.status]
 * @param {string} [params.cv_style]
 * @returns {Promise<{ cvId: string, cvData: object }>}
 */
export async function generateCv({ 
  db, 
  userId, 
  profileId, 
  document_title, 
  status, 
  cv_style,
  custom_target_role,
  cv_focus,
  excluded_experience_ids,
  excluded_skills,
  candidate_data,
  target_job_description,
  aiGenerate = generateWithFallback,
}) {
  // 1. Obtener perfil
  const { data: profile, error: profileError } = await cvRepo.getProfile(db, profileId);
  if (profileError || !profile) {
    console.error('[cvService] Error recuperando perfil:', profileError);
    throw appError('Perfil no encontrado en la base de datos', 404, 'PROFILE_NOT_FOUND');
  }

  // 2. Obtener formación académica y experiencia laboral en paralelo
  const [academic, work] = await Promise.all([
    cvRepo.getAcademicBackground(db, profileId),
    cvRepo.getWorkExperience(db, profileId),
  ]);

  // 3. Consolidar la información estructurada aplicando filtros
  const excludedSkillKeys = new Set((excluded_skills || []).map(normalize));
  const excludedExperienceIds = new Set((excluded_experience_ids || []).map(text));
  const targetJobDescription = text(target_job_description ?? profile.target_job_description).trim();
  const candidateTechnicalSkills = candidate_data?.skills?.technical || profile.technical_skills || [];
  const candidateSoftSkills = candidate_data?.skills?.soft || profile.soft_skills || [];
  const candidateWork = candidate_data?.work_experience || work;
  const candidateAcademic = candidate_data?.academic_background || academic;
  const candidateCertifications = candidate_data?.certifications || getCertifications(profile);
  const userInputData = {
    personal_info: {
      first_name:  candidate_data?.personal_info?.first_name ?? profile.first_name,
      last_name:   candidate_data?.personal_info?.last_name ?? profile.last_name,
      email:       candidate_data?.personal_info?.email ?? profile.email,
      phone:       candidate_data?.personal_info?.phone ?? profile.phone,
      location:    candidate_data?.personal_info?.location ?? profile.location,
      linkedin:    candidate_data?.personal_info?.linkedin ?? profile.linkedin,
      portfolio:   candidate_data?.personal_info?.portfolio ?? profile.portfolio,
      career:      candidate_data?.personal_info?.career ?? profile.career,
      target_role: custom_target_role ?? candidate_data?.personal_info?.target_role ?? profile.target_role,
      bio:         candidate_data?.personal_info?.bio ?? profile.bio,
      cv_focus:    cv_focus || 'ATS',
    },
    skills: {
      technical: candidateTechnicalSkills.filter((skill) => !excludedSkillKeys.has(normalize(skill))),
      soft:      candidateSoftSkills.filter((skill) => !excludedSkillKeys.has(normalize(skill))),
    },
    certifications: candidateCertifications,
    academic_background: candidateAcademic,
    work_experience: candidateWork
      .map((record, index) => ({ ...record, id: record.id || `candidate-exp-${index}` }))
      .filter((record) => !excludedExperienceIds.has(text(record.id))),
  };

  // 4. Invocar a la IA; fallback honesto si la IA no está disponible
  let cvJson;
  try {
    const focusLabel = cv_focus || 'ATS';
    const focusDescription = focusLabel === 'técnico' ? 'técnico (resaltando stacks, arquitecturas, metodologías)'
      : focusLabel === 'ejecutivo' ? 'ejecutivo (resaltando liderazgo, gestión de proyectos, visión estratégica)'
      : focusLabel === 'junior' ? 'junior (resaltando aprendizaje rápido, proyectos académicos, adaptabilidad)'
      : focusLabel === 'senior' ? 'senior (resaltando impacto cuantificable, mentoría, toma de decisiones)'
      : 'ATS estándar de alto impacto';

    const cvJsonText = await aiGenerate({
      useCase:   'cv_generation',
      messages:  [
        { role: 'system', content: SYSTEM_PROMPT_CV },
        { role: 'user', content: buildCvUserPrompt(userInputData, targetJobDescription, focusDescription) },
      ],
      db,
      userId,
      jsonMode:  true,
      responseSchema: generatedCvJsonSchema,
      maxTokens: 4000,
    });
    cvJson = parseAndReconcileGeneratedCv(cvJsonText, profile, userInputData);
  } catch (apiError) {
    console.warn(
      '⚠️ Error en generación de CV por IA. Usando SOLO los datos reales del perfil como respaldo. Detalle:',
      apiError.message
    );
    cvJson = generatedCvSchema.parse(buildFallbackCv(profile, userInputData, targetJobDescription));
  }

  cvJson = persistedCvSchema.parse({
    ...cvJson,
    snapshot_version: 1,
    personal_info: Object.fromEntries(
      ['first_name', 'last_name', 'email', 'phone', 'location', 'linkedin', 'portfolio', 'career', 'target_role']
        .map((field) => [field, text(userInputData.personal_info[field])])
    ),
    target_job_description: targetJobDescription,
    cv_focus: cv_focus || 'ATS',
  });

  // 5. Guardar en la base de datos.
  // Si el esquema real no tiene alguna columna de metadatos (migración
  // supabase/migration_fix_all.sql pendiente), se reintenta sin esa columna
  // para no bloquear la generación: el CV se guarda con los campos que sí
  // existen. profile_id y cv_data son parte del esquema base y nunca se omiten.
  const defaultTitle = `CV ${profile.first_name || 'Egresado'} - ${custom_target_role || profile.target_role || profile.career || 'TI'}`;
  const insertPayload = {
    profile_id:     profileId,
    cv_data:        cvJson,
    document_title: document_title || defaultTitle,
    status:         status    || 'generated',
    cv_style:       cv_style  || null,
  };
  const REQUIRED_COLUMNS = ['profile_id', 'cv_data'];

  let savedCv   = null;
  let lastError = null;
  const maxAttempts = Object.keys(insertPayload).length - REQUIRED_COLUMNS.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error, errorCode } = await cvRepo.insertCv(db, insertPayload);
    if (!error) {
      savedCv = data;
      break;
    }
    lastError = error;

    // PGRST204: "Could not find the 'X' column..." / 42703: "column t.X does not exist"
    const missingColumn = errorCode === 'DB_SCHEMA_MISMATCH'
      ? (error.message?.match(/'([^']+)' column/)?.[1] ||
         error.message?.match(/column (?:\w+\.)?"?(\w+)"? does not exist/)?.[1])
      : null;

    if (missingColumn && !REQUIRED_COLUMNS.includes(missingColumn) && missingColumn in insertPayload) {
      console.warn(
        `[cvService] La columna '${missingColumn}' no existe en generated_cvs. ` +
        `Se reintenta el guardado sin ella. Ejecuta supabase/migration_fix_all.sql en Supabase para actualizar el esquema.`
      );
      delete insertPayload[missingColumn];
      continue;
    }
    break;
  }

  if (!savedCv) {
    console.error('[cvService] Error guardando el CV en Supabase:', lastError);
    const isSchemaError = lastError?.code === 'PGRST204' || lastError?.code === '42703';
    throw appError(
      isSchemaError
        ? 'No se pudo guardar el CV: el esquema de la base de datos está desactualizado. Ejecuta la migración supabase/migration_fix_all.sql.'
        : 'No se pudo guardar el CV en la base de datos.',
      500,
      isSchemaError ? 'DB_SCHEMA_MISMATCH' : 'CV_SAVE_FAILED'
    );
  }

  return { cvId: savedCv.id, cvData: cvJson };
}

/**
 * Parsea el texto de un CV con IA y actualiza el perfil del usuario.
 *
 * La importación exige IA y valida el contrato. El guardado es atómico;
 * los errores bloquean la operación y no se presentan como éxito.
 *
 * @param {object} params
 * @param {object} params.db        - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId    - ID del usuario autenticado (req.user.id)
 * @param {string} params.profileId
 * @param {string} params.cvText
 * @returns {Promise<{ parsedData: object }>}
 */
export async function parseCv({ db, userId, profileId, cvText, generate = generateWithFallback }) {
  const { parsedData } = await parseCvRaw({ db, userId, cvText, generate });
  const { data: currentProfile, error: profileError } = await cvRepo.getProfile(db, profileId);
  if (profileError || !currentProfile) throw appError('No se pudo leer el perfil antes de importar. No se guardó ningún dato.', 404, 'PROFILE_REQUIRED');

  const profileUpdate = {};
  for (const field of ['first_name', 'last_name', 'phone', 'location', 'career', 'bio']) {
    if (parsedData[field]?.trim()) profileUpdate[field] = parsedData[field];
  }
  for (const field of ['target_role', 'target_job_description']) {
    if (!currentProfile[field]?.trim() && parsedData[field]?.trim()) profileUpdate[field] = parsedData[field];
  }
  if (parsedData.technical_skills.length) profileUpdate.technical_skills = parsedData.technical_skills;
  if (parsedData.soft_skills.length) profileUpdate.soft_skills = parsedData.soft_skills;

  // Empty import sections must retain existing records. The RPC commits all
  // three sections together or rolls back; no delete-then-insert soft failure.
  const academic = parsedData.academic_background.length ? parsedData.academic_background
    : await cvRepo.getAcademicBackground(db, profileId);
  const work = parsedData.work_experience.length ? parsedData.work_experience
    : await cvRepo.getWorkExperience(db, profileId);
  const validation = fullProfileUpdateSchema.safeParse({
    profile: profileUpdate,
    academic_background: academic.map(({ institution, degree, start_date, end_date, description }) => ({ institution, degree, start_date, end_date, description })),
    work_experience: work.map(({ company, role, start_date, end_date, description, achievements }) => ({ company, role, start_date, end_date, description, achievements })),
  });
  if (!validation.success) throw appError('Revisa los campos y fechas del CV antes de guardar. No se guardó ningún dato.', 422, 'CV_IMPORT_REVIEW_REQUIRED');
  const { error } = await db.rpc('replace_current_user_profile_data', {
    p_profile: validation.data.profile,
    p_academic: validation.data.academic_background,
    p_work: validation.data.work_experience,
  });
  if (error) throw appError('No se pudo guardar el perfil importado. La operación fue cancelada sin reemplazar parcialmente tus datos.', 500, 'CV_IMPORT_SAVE_FAILED');
  return { parsedData };
}

/**
 * Extrae los datos estructurados de un CV en texto libre con IA, SIN persistir
 * nada en el perfil del usuario. Se usa para autocompletar el wizard de CV:
 * el usuario decide después si guarda o descarta los datos.
 *
 * @param {object} params
 * @param {object} params.db      - Cliente Supabase autenticado (req.db)
 * @param {string} params.userId  - ID del usuario autenticado (req.user.id)
 * @param {string} params.cvText
 * @returns {Promise<{ parsedData: object }>}
 */
export async function parseCvRaw({ db, userId, cvText, generate = generateWithFallback }) {
  const maxTokens = cvImportTokenBudget(cvText);
  let raw;
  try {
    raw = await generate({
      useCase: 'cv_generation',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_CV_IMPORT_FAITHFUL },
        { role: 'user', content: JSON.stringify({ cv_document: cvText }) },
      ],
      db, userId, jsonMode: true, maxTokens,
      responseSchema: importedCvJsonSchema,
    });
  } catch {
    // No silent regex fallback: it omits experience and appears successful.
    throw appError('No se pudo importar el CV con IA. No se modificó tu formulario; revisa tu proveedor y vuelve a intentarlo.', 502, 'CV_IMPORT_AI_UNAVAILABLE');
  }
  return { parsedData: parseImportedCv(raw, cvText) };
}

/**
 * Elimina un CV del usuario autenticado.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.id      - ID del CV (generated_cvs.id)
 * @param {string} params.userId  - ID del usuario autenticado (req.user.id)
 * @returns {Promise<void>}
 */
export async function deleteUserCv({ db, id, userId }) {
  const { error } = await cvRepo.deleteCv(db, id, userId);
  if (error) {
    console.error('[cvService] Error al eliminar CV:', error);
    throw appError('Error al eliminar el CV en la base de datos', 500);
  }
}

/**
 * Actualiza campos editables de un CV del usuario autenticado.
 * Solo actualiza los campos que llegan definidos en `fields`.
 *
 * @param {object} params
 * @param {object} params.db
 * @param {string} params.id
 * @param {string} params.userId
 * @param {object} params.fields
 * @param {string} [params.fields.status]
 * @param {string} [params.fields.document_title]
 * @param {string} [params.fields.cv_style]
 * @param {object} [params.fields.cv_data]
 * @returns {Promise<{ cv: object }>}
 */
export async function updateUserCv({ db, id, userId, fields }) {
  const updatePayload = {};
  if (fields.status         !== undefined) updatePayload.status         = fields.status;
  if (fields.document_title !== undefined) updatePayload.document_title = fields.document_title;
  if (fields.cv_style       !== undefined) updatePayload.cv_style       = fields.cv_style;
  if (fields.cv_data        !== undefined) updatePayload.cv_data        = fields.cv_data;
  updatePayload.updated_at = new Date().toISOString();

  const { data: updatedCv, error } = await cvRepo.updateCv(db, id, userId, updatePayload);

  if (error) {
    console.error('[cvService] Error al actualizar CV:', error);
    throw appError('Error al actualizar el CV.', 400, 'CV_UPDATE_FAILED');
  }

  return { cv: updatedCv };
}
